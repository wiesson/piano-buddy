import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { audioContext, getPiano, holdNote } from '@piano/core/audio/audio'
import { fingerToMidi, keyToFinger } from '@piano/core/input/fingerKeys'
import { LESSONS, type Lesson } from '@piano/core/music/lessons'
import { isBlack, noteLabel } from '@piano/core/music/notes'
import { localized, t } from '@piano/core/i18n'
import { displayNoteName } from '@piano/core/i18n/noteNames'

/**
 * Zum Ausprobieren auf der Startseite: die ersten vier Takte der Ode an die Freude, rechte Hand,
 * im Warte-Modus wie in der App. Die nächste Taste leuchtet in der Handfarbe, die Leiste darüber
 * zeigt die Phrase als Pianorolle von links nach rechts. Tippen, klicken oder Fingertasten.
 *
 * Wird per React.lazy erst geladen, wenn die Section in die Nähe kommt; die Klavierklänge erst,
 * wenn jemand die Klaviatur berührt.
 */

const LESSON = LESSONS.find((l) => l.id === 'ode') as Lesson
const PHRASE = LESSON.notes.filter((n) => n.hand === 'R' && n.start < 16)
const LO = 60 // C4
const HI = 76 // E5; auf dem Handy endet die Klaviatur bei C5 (home.css)
const PHONE_LAST = 72

type Flash = 'hit' | 'wrong'
type Sound = 'idle' | 'loading' | 'ready'

export default function TryPiano({ onOpen }: { onOpen: (l: Lesson) => void }) {
  const [step, setStep] = useState(0)
  const [wrong, setWrong] = useState(0)
  const [flash, setFlash] = useState<Record<number, Flash>>({})
  const [holding, setHolding] = useState(0)
  const [demo, setDemo] = useState<number | null>(null)
  const [sound, setSound] = useState<Sound>('idle')
  const root = useRef<HTMLDivElement>(null)
  const timers = useRef<Record<number, number>>({})
  const demoTimers = useRef<number[]>([])
  /** Gehaltene Tasten je Finger, Zeiger oder Taste der Computertastatur */
  const held = useRef(new Map<string, { midi: number; release: () => void }>())
  const stepRef = useRef(0)
  stepRef.current = step
  const done = step >= PHRASE.length
  // Wie am Klavier: Das nächste Ziel leuchtet erst, wenn die Hand die Taste loslässt
  const next = done || demo !== null || holding > 0 ? null : PHRASE[step]

  /** Klang erst bei der ersten Berührung laden (einige MB Samples) */
  const warm = useCallback(() => {
    if (sound !== 'idle') return
    setSound('loading')
    const ready = () => setSound('ready')
    void getPiano().load.then(ready, ready)
  }, [sound])

  const play = useCallback((midi: number, dur: number) => {
    const c = audioContext()
    getPiano().start({ note: midi, velocity: 80, duration: dur, time: c.currentTime })
  }, [])

  const mark = useCallback((midi: number, kind: Flash) => {
    window.clearTimeout(timers.current[midi])
    setFlash((f) => ({ ...f, [midi]: kind }))
  }, [])

  /** Nach dem Loslassen leuchtet die Taste kurz nach, damit auch ein schneller Tipp sichtbar ist */
  const unmark = useCallback((midi: number) => {
    timers.current[midi] = window.setTimeout(() => {
      setFlash((f) => {
        const { [midi]: _, ...rest } = f
        return rest
      })
    }, 120)
  }, [])

  const stopDemo = useCallback(() => {
    demoTimers.current.forEach((id) => window.clearTimeout(id))
    demoTimers.current = []
    setDemo(null)
  }, [])

  /** Taste gedrückt: Ton an, Treffer zählt sofort (wie MIDI Note-On) */
  const down = useCallback(
    (id: string, midi: number) => {
      if (held.current.has(id)) return
      warm()
      if (demoTimers.current.length) stopDemo()
      held.current.set(id, { midi, release: holdNote(midi) })
      setHolding(held.current.size)
      const i = stepRef.current
      if (i >= PHRASE.length) return mark(midi, 'hit')
      if (midi === PHRASE[i].midi) {
        mark(midi, 'hit')
        // sofort weiterzählen: zwei schnelle Töne im selben Frame sollen nicht denselben Schritt prüfen
        stepRef.current = i + 1
        setStep(i + 1)
      } else {
        mark(midi, 'wrong')
        setWrong((w) => w + 1)
      }
    },
    [warm, stopDemo, mark],
  )

  /** Taste losgelassen: Ton klingt aus, das nächste Ziel erscheint */
  const up = useCallback(
    (id: string) => {
      const h = held.current.get(id)
      if (!h) return
      h.release()
      held.current.delete(id)
      setHolding(held.current.size)
      unmark(h.midi)
    },
    [unmark],
  )

  const releaseAll = useCallback(() => [...held.current.keys()].forEach(up), [up])

  /** Erst hören, dann spielen: die Phrase im Tempo des Stücks, die Tasten leuchten mit */
  const listen = async () => {
    if (demo !== null) return stopDemo()
    warm()
    audioContext()
    await getPiano().load
    const spb = 60 / LESSON.bpm
    stepRef.current = 0
    setStep(0)
    setWrong(0)
    demoTimers.current = PHRASE.map((n, i) =>
      window.setTimeout(() => {
        play(n.midi, n.dur * spb)
        setDemo(i)
      }, n.start * spb * 1000),
    )
    const end = PHRASE[PHRASE.length - 1]
    demoTimers.current.push(window.setTimeout(stopDemo, (end.start + end.dur) * spb * 1000))
  }

  const restart = () => {
    stopDemo()
    stepRef.current = 0
    setStep(0)
    setWrong(0)
  }

  // Fingertasten wie in der App (rechts H J K L Ö), nur solange die Klaviatur zu sehen ist.
  // Einmal registriert; down/up kommen über Refs, sonst ginge beim Neuregistrieren ein Ton verloren.
  const handlers = useRef({ down, up, releaseAll })
  handlers.current = { down, up, releaseAll }
  useEffect(() => {
    const el = root.current
    if (!el) return
    let visible = false
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.4 })
    io.observe(el)
    const onDown = (e: KeyboardEvent) => {
      if (!visible || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable]')) return
      const f = keyToFinger(e.code)
      if (!f || f.hand !== 'R') return
      const at = PHRASE[Math.min(stepRef.current, PHRASE.length - 1)].start
      const midi = fingerToMidi(PHRASE, at, 'R', f.finger)
      if (midi === null) return
      e.preventDefault()
      handlers.current.down(`k${e.code}`, midi)
    }
    const onUp = (e: KeyboardEvent) => handlers.current.up(`k${e.code}`)
    const onBlur = () => handlers.current.releaseAll()
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      io.disconnect()
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useEffect(
    () => () => {
      demoTimers.current.forEach((id) => window.clearTimeout(id))
      Object.values(timers.current).forEach((id) => window.clearTimeout(id))
      held.current.forEach((h) => h.release())
    },
    [],
  )

  /** Zeiger und Tastatur-Bedienung (Enter, Leertaste) für eine Taste */
  const keyEvents = (m: number) => ({
    onPointerDown: (e: PointerEvent) => (e.preventDefault(), down(`p${e.pointerId}`, m)),
    onPointerUp: (e: PointerEvent) => up(`p${e.pointerId}`),
    onPointerCancel: (e: PointerEvent) => up(`p${e.pointerId}`),
    onPointerLeave: (e: PointerEvent) => up(`p${e.pointerId}`),
    onClick: (e: MouseEvent) => {
      if (e.detail !== 0) return
      down(`a${m}`, m)
      window.setTimeout(() => up(`a${m}`), 250)
    },
  })

  const lit = demo !== null ? PHRASE[demo].midi : null
  const keyClass = (m: number) =>
    [
      m === next?.midi && 'is-next',
      m === lit && 'is-demo',
      flash[m] && `is-${flash[m]}`,
      m > PHONE_LAST && 'pk-wide',
    ]
      .filter(Boolean)
      .join(' ')

  const whites: number[] = []
  for (let m = LO; m <= HI; m++) if (!isBlack(m)) whites.push(m)

  const status =
    sound === 'loading'
      ? t.home.tryIt.loading
      : done
        ? wrong === 0
          ? t.practice.resultClean
          : t.practice.resultWrong(wrong)
        : t.home.tryIt.progress(step, PHRASE.length)

  return (
    <div className="try-card" ref={root} onPointerEnter={warm}>
      <div className="try-head">
        <span>
          {localized(LESSON.title)} · {t.stage.R}
        </span>
        <span aria-live="polite">{status}</span>
      </div>

      <ol className="try-strip" aria-label={t.home.tryIt.phrase}>
        {PHRASE.map((n, i) => (
          <li
            key={i}
            style={{ flexGrow: n.dur }}
            className={i < step ? 'is-done' : i === step && next ? 'is-now' : i === demo ? 'is-demo' : ''}
          >
            {displayNoteName(n.midi)}
          </li>
        ))}
      </ol>

      <div className="pk" role="group" aria-label={t.practice.keyboard}>
        {whites.map((m) => (
          <div key={m} className={`pk-slot${m > PHONE_LAST ? ' pk-wide' : ''}`}>
            <button
              type="button"
              className={`pk-white ${keyClass(m)}`}
              aria-label={noteLabel(m)}
              {...keyEvents(m)}
            >
              {m === next?.midi && next.finger && <span className="pk-finger">{next.finger}</span>}
              <span className="pk-name">{displayNoteName(m)}</span>
            </button>
            {isBlack(m + 1) && m + 1 <= HI && (
              <button
                type="button"
                className={`pk-black ${keyClass(m + 1)}`}
                aria-label={noteLabel(m + 1)}
                {...keyEvents(m + 1)}
              />
            )}
          </div>
        ))}
      </div>

      <div className="try-foot">
        {done ? (
          <>
            <button type="button" className="pb-btn pb-btn-primary" onClick={() => onOpen(LESSON)}>
              {t.home.tryIt.whole}
            </button>
            <button type="button" className="pb-btn pb-btn-ghost" onClick={restart}>
              {t.practice.again}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="pb-btn pb-btn-ghost" onClick={listen} aria-pressed={demo !== null}>
              {demo !== null ? t.home.tryIt.stop : t.home.tryIt.listen}
            </button>
            {step > 0 && (
              <button type="button" className="pb-btn pb-btn-ghost" onClick={restart}>
                {t.practice.restart}
              </button>
            )}
            <span className="pb-mono try-keys">{t.home.tryIt.keys}</span>
          </>
        )}
      </div>
    </div>
  )
}
