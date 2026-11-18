import { useCallback, useEffect, useRef, useState } from 'react'
import { audioContext, getPiano } from '../../audio/audio'
import { fingerToMidi, keyToFinger } from '../../input/fingerKeys'
import { LESSONS, type Lesson } from '../../music/lessons'
import { isBlack, noteLabel } from '../../music/notes'
import { localized, t } from '../../i18n'
import { displayNoteName } from '../../i18n/noteNames'

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
  const [demo, setDemo] = useState<number | null>(null)
  const [sound, setSound] = useState<Sound>('idle')
  const root = useRef<HTMLDivElement>(null)
  const timers = useRef<Record<number, number>>({})
  const demoTimers = useRef<number[]>([])
  const stepRef = useRef(0)
  stepRef.current = step
  const done = step >= PHRASE.length
  const next = done || demo !== null ? null : PHRASE[step]

  /** Klang erst bei der ersten Berührung laden (einige MB Samples) */
  const warm = useCallback(() => {
    if (sound !== 'idle') return
    setSound('loading')
    const ready = () => setSound('ready')
    void getPiano().load.then(ready, ready)
  }, [sound])

  const play = useCallback((midi: number, dur = 0.7) => {
    const c = audioContext()
    const p = getPiano()
    p.start({ note: midi, velocity: 80, duration: dur, time: c.currentTime })
  }, [])

  const blink = useCallback((midi: number, kind: Flash) => {
    window.clearTimeout(timers.current[midi])
    setFlash((f) => ({ ...f, [midi]: kind }))
    timers.current[midi] = window.setTimeout(() => {
      setFlash((f) => {
        const { [midi]: _, ...rest } = f
        return rest
      })
    }, 260)
  }, [])

  const stopDemo = useCallback(() => {
    demoTimers.current.forEach((id) => window.clearTimeout(id))
    demoTimers.current = []
    setDemo(null)
  }, [])

  const press = useCallback(
    (midi: number) => {
      warm()
      if (demoTimers.current.length) stopDemo()
      play(midi)
      const i = stepRef.current
      if (i >= PHRASE.length) return blink(midi, 'hit')
      if (midi === PHRASE[i].midi) {
        blink(midi, 'hit')
        // sofort weiterzählen: zwei schnelle Töne im selben Frame sollen nicht denselben Schritt prüfen
        stepRef.current = i + 1
        setStep(i + 1)
      } else {
        blink(midi, 'wrong')
        setWrong((w) => w + 1)
      }
    },
    [warm, stopDemo, play, blink],
  )

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
  // Einmal registriert; press kommt über die Ref, sonst ginge beim Neuregistrieren ein Ton verloren.
  const pressRef = useRef(press)
  pressRef.current = press
  useEffect(() => {
    const el = root.current
    if (!el) return
    let visible = false
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.4 })
    io.observe(el)
    const onKey = (e: KeyboardEvent) => {
      if (!visible || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return
      const f = keyToFinger(e.code)
      if (!f || f.hand !== 'R') return
      const at = PHRASE[Math.min(stepRef.current, PHRASE.length - 1)].start
      const midi = fingerToMidi(PHRASE, at, 'R', f.finger)
      if (midi === null) return
      e.preventDefault()
      pressRef.current(midi)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      io.disconnect()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(
    () => () => {
      demoTimers.current.forEach((id) => window.clearTimeout(id))
      Object.values(timers.current).forEach((id) => window.clearTimeout(id))
    },
    [],
  )

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
            className={i < step ? 'is-done' : i === step && !done && demo === null ? 'is-now' : i === demo ? 'is-demo' : ''}
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
              onPointerDown={(e) => (e.preventDefault(), press(m))}
              onClick={(e) => e.detail === 0 && press(m)}
            >
              {m === next?.midi && next.finger && <span className="pk-finger">{next.finger}</span>}
              <span className="pk-name">{displayNoteName(m)}</span>
            </button>
            {isBlack(m + 1) && m + 1 <= HI && (
              <button
                type="button"
                className={`pk-black ${keyClass(m + 1)}`}
                aria-label={noteLabel(m + 1)}
                onPointerDown={(e) => (e.preventDefault(), press(m + 1))}
                onClick={(e) => e.detail === 0 && press(m + 1)}
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
