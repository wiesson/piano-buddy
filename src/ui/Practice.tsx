import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { notesForStage, stageLabel, stagesFor, type Lesson, type Stage } from '../music/lessons'
import { WaitSession, type PassResult } from '../practice/session'
import { CLEAN_GOAL, cleanCount, loadProgress, recordPass } from '../practice/progress'
import { MicListener, type MicStatus } from '../audio/mic'
import { audioContext, getPiano, playNote, stopAll } from '../audio/audio'
import { connectMidi, keyToMidi, midiSupported, type NoteOn } from '../input/sources'
import { Roll, type RollView } from './Roll'

const MIC_TEXT: Record<MicStatus, string> = {
  off: 'Mikrofon an',
  starting: 'Mikrofon startet',
  calibrating: 'Kurz still sein',
  listening: 'Hört zu',
  denied: 'Mikrofon gesperrt',
  error: 'Mikrofon fehlt',
}

export function Practice({ lesson, onBack }: { lesson: Lesson; onBack: () => void }) {
  const stages = useMemo(() => stagesFor(lesson), [lesson])
  const [progress, setProgress] = useState(loadProgress)
  const [stage, setStage] = useState<Stage>(
    () => stages.find((s) => cleanCount(loadProgress(), lesson.id, s) < CLEAN_GOAL) ?? stages[stages.length - 1],
  )
  const [micStatus, setMicStatus] = useState<MicStatus>('off')
  const [midiNames, setMidiNames] = useState<string[]>([])
  const [showNames, setShowNames] = useState(true)
  const [showFingers, setShowFingers] = useState(true)
  const [demo, setDemo] = useState(false)
  const [result, setResult] = useState<PassResult | null>(null)
  const [, force] = useState(0)

  const sessionRef = useRef<WaitSession | null>(null)
  const heardRef = useRef<number[]>([])
  const levelRef = useRef(0)
  const beatRef = useRef(0)
  const demoRef = useRef<{ t0: number; bpm: number } | null>(null)
  const micRef = useRef<MicListener | null>(null)

  const onPass = useCallback(
    (r: PassResult) => {
      setProgress(recordPass(lesson.id, stage, r.clean))
      setResult(r)
    },
    [lesson.id, stage],
  )

  // neue Sitzung je Stufe
  useEffect(() => {
    const s = new WaitSession(lesson, stage, onPass)
    s.restart()
    sessionRef.current = s
    beatRef.current = s.beat
    setResult(null)
    force((x) => x + 1)
  }, [lesson, stage, onPass])

  const input = useCallback((e: NoteOn) => {
    const s = sessionRef.current
    if (!s || demoRef.current) return
    if (s.finished) return
    s.input(e)
    force((x) => x + 1)
  }, [])

  // Mikrofon
  useEffect(() => {
    const mic = new MicListener({
      expected: () => sessionRef.current?.expected ?? new Set(),
      onNote: (midi, tMs) => input({ midi, tMs, source: 'mic' }),
      onStatus: setMicStatus,
      onLevel: (level, heard) => {
        levelRef.current = level
        heardRef.current = heard
      },
    })
    micRef.current = mic
    return () => mic.stop()
  }, [input])

  // MIDI, wo der Browser es kann (Chrome/Edge am Mac). Safari auf iPhone/iPad hat kein Web MIDI.
  useEffect(() => {
    if (!midiSupported()) return
    let off: (() => void) | undefined
    connectMidi(input, setMidiNames)
      .then((o) => (off = o))
      .catch(() => {})
    return () => off?.()
  }, [input])

  // Computertastatur
  const lowest = Math.min(...lesson.notes.map((n) => n.midi))
  useEffect(() => {
    const base = Math.min(48, Math.floor(lowest / 12) * 12)
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey) return
      const m = keyToMidi(e.code, base)
      if (m === null) return
      e.preventDefault()
      if (micRef.current?.status !== 'listening') playNote(m)
      input({ midi: m, tMs: performance.now(), source: 'keys' })
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [input, lowest])

  // Display wach halten, solange geübt wird
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    navigator.wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => {})
    return () => void lock?.release()
  }, [])

  // Klavierklang vorladen
  useEffect(() => {
    getPiano()
  }, [])

  const onKey = useCallback(
    (m: number) => {
      audioContext()
      if (micRef.current?.status !== 'listening') playNote(m)
      input({ midi: m, tMs: performance.now(), source: 'touch' })
    },
    [input],
  )

  const toggleMic = () => {
    const mic = micRef.current!
    if (mic.status === 'listening' || mic.status === 'calibrating') mic.stop()
    else void mic.start()
  }

  const startDemo = () => {
    if (demoRef.current) {
      stopAll()
      demoRef.current = null
      setDemo(false)
      return
    }
    const ctx = audioContext()
    const notes = notesForStage(lesson, stage)
    const spb = 60 / lesson.bpm
    const t0 = ctx.currentTime + 0.6
    for (const n of notes) playNote(n.midi, n.dur * spb * 0.95, t0 + n.start * spb, n.hand === 'L' ? 62 : 78)
    demoRef.current = { t0, bpm: lesson.bpm }
    setDemo(true)
  }

  // Anzeige-Zustand, gelesen im Zeichen-Loop der Roll
  const stageNotes = useMemo(() => notesForStage(lesson, stage), [lesson, stage])
  const view = useCallback((): RollView => {
    const s = sessionRef.current
    const now = performance.now()
    s?.tick(now)
    let beat: number
    let expected: ReadonlySet<number> = s?.expected ?? new Set()
    let struck: ReadonlySet<number> = s?.struck ?? new Set()
    const d = demoRef.current
    if (d) {
      beat = ((audioContext().currentTime - d.t0) * d.bpm) / 60
      const last = Math.max(...stageNotes.map((n) => n.start + n.dur))
      if (beat > last + 1) {
        demoRef.current = null
        setDemo(false)
      }
      expected = new Set(stageNotes.filter((n) => beat >= n.start && beat < n.start + n.dur).map((n) => n.midi))
      struck = new Set()
      // in der Vorschau gleitet die Bahn mit; „aktuell“ = klingende Noten
      beatRef.current = beat
    } else {
      // im Warte-Modus weich zum aktuellen Schritt gleiten
      const target = s?.finished ? (s.steps[s.steps.length - 1]?.start ?? 0) + 2 : (s?.beat ?? 0)
      beatRef.current += (target - beatRef.current) * 0.25
      if (Math.abs(target - beatRef.current) < 0.002) beatRef.current = target
      beat = beatRef.current
    }
    // „aktuell“ markieren wir nur, wenn die Bahn am Schritt angekommen ist
    const arrived = d ? true : Math.abs(beat - (s?.beat ?? 0)) < 0.4
    return {
      notes: stageNotes,
      rangeNotes: lesson.notes,
      beat: d ? beat : arrived ? (s?.beat ?? beat) : beat,
      expected: d || arrived ? expected : new Set(),
      struck,
      flashes: (s?.feedback ?? []).map((f) => ({ midi: f.midi, kind: f.kind, age: now - f.tMs })),
      heard: heardRef.current,
      showNames,
      showFingers,
    }
  }, [lesson.notes, stageNotes, showNames, showFingers])

  const again = () => {
    sessionRef.current?.restart()
    setResult(null)
    force((x) => x + 1)
  }

  const nextStage = stages[stages.indexOf(stage) + 1]
  const clean = cleanCount(progress, lesson.id, stage)
  const s = sessionRef.current
  const listening = micStatus === 'listening' || micStatus === 'calibrating'

  return (
    <div className="practice">
      <header className="bar">
        <button className="ghost back" onClick={onBack} aria-label="Zurück zur Übersicht">
          ‹
        </button>
        <div className="title">
          <h1>{lesson.title}</h1>
          <p className="goal">{lesson.goal}</p>
        </div>
        <div className="stages" role="tablist" aria-label="Hand">
          {stages.map((st) => (
            <button
              key={st}
              role="tab"
              aria-selected={st === stage}
              className={`stage stage-${st}`}
              onClick={() => setStage(st)}
            >
              <span>{stageLabel[st]}</span>
              <span className="dots" aria-label={`${cleanCount(progress, lesson.id, st)} von ${CLEAN_GOAL} sauber`}>
                {Array.from({ length: CLEAN_GOAL }, (_, i) => (
                  <i key={i} className={i < cleanCount(progress, lesson.id, st) ? 'on' : ''} />
                ))}
              </span>
            </button>
          ))}
        </div>
      </header>

      <main className="stage-area">
        <Roll view={view} beatsPerBar={lesson.beatsPerBar} onKey={onKey} />
        {result && (
          <div className="result" role="status">
            <p className="result-head">{result.clean ? 'Sauber durchgespielt' : `Durch, mit ${result.wrong} ${result.wrong === 1 ? 'falschem Ton' : 'falschen Tönen'}`}</p>
            <p className="result-sub">
              {clean >= CLEAN_GOAL
                ? nextStage
                  ? `${stageLabel[stage]} sitzt. Als Nächstes: ${stageLabel[nextStage]}.`
                  : 'Beide Hände sitzen. Morgen einmal wiederholen, dann bleibt es.'
                : `${clean} von ${CLEAN_GOAL} sauberen Durchgängen.`}
            </p>
            <div className="result-actions">
              <button className="primary" onClick={again}>
                Nochmal
              </button>
              {clean >= CLEAN_GOAL && nextStage && (
                <button className="secondary" onClick={() => setStage(nextStage)}>
                  Weiter mit {stageLabel[nextStage]}
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="bar tools">
        <button className={`mic ${micStatus}`} onClick={toggleMic} aria-pressed={listening}>
          <span className="meter" aria-hidden>
            <MicMeter levelRef={levelRef} active={listening} />
          </span>
          {MIC_TEXT[micStatus]}
        </button>
        {midiNames.length > 0 && <span className="pill">MIDI: {midiNames[0]}</span>}
        <button className={`toggle ${demo ? 'on' : ''}`} onClick={startDemo}>
          {demo ? 'Vorspielen stoppen' : 'Vorspielen'}
        </button>
        <span className="spacer" />
        <button className={`toggle ${showNames ? 'on' : ''}`} aria-pressed={showNames} onClick={() => setShowNames((x) => !x)}>
          Notennamen
        </button>
        <button className={`toggle ${showFingers ? 'on' : ''}`} aria-pressed={showFingers} onClick={() => setShowFingers((x) => !x)}>
          Finger
        </button>
        <button className="ghost" onClick={again} disabled={!s || (s.index === 0 && !result)}>
          Von vorn
        </button>
      </footer>
    </div>
  )
}

function MicMeter({ levelRef, active }: { levelRef: React.RefObject<number>; active: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (ref.current) ref.current.style.transform = `scaleY(${active ? Math.max(0.12, levelRef.current) : 0.12})`
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [active, levelRef])
  return <span ref={ref} className="meter-fill" />
}
