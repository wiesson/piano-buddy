import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { notesForStage, stageLabel, stagesFor, type Lesson, type Stage } from '../music/lessons'
import { WaitSession, type PassResult } from '../practice/session'
import { CLEAN_GOAL } from '../practice/goal'
import { store } from '../sync/store'
import { useStoreVersion } from '../sync/Sync'
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from '@ui-sdk/react/segmented-control'
import { Toggle } from '@ui-sdk/react/toggle'
import { MicListener, type MicStatus } from '../audio/mic'
import { audioContext, getPiano, playNote, stopAll } from '../audio/audio'
import { keyToMidi, type NoteOn } from '../input/sources'
import { canPairBluetooth, connectMidi, midiKind, showBluetoothPairing, type MidiHandle } from '../input/midi'
import { MicBench, type BenchStats } from '../practice/bench'
import { noteLabel } from '../music/notes'
import { toast } from './toaster'
import { Roll, type RollView } from './Roll'

const MIC_TEXT: Record<MicStatus, string> = {
  off: 'Mikrofon',
  starting: 'Mikrofon startet',
  calibrating: 'Kurz still sein',
  listening: 'Hört zu',
  denied: 'Mikrofon gesperrt',
  error: 'Mikrofon fehlt',
}

export function Practice({ lesson, onBack }: { lesson: Lesson; onBack: () => void }) {
  const stages = useMemo(() => stagesFor(lesson), [lesson])
  useStoreVersion()
  const cleanCount = (st: Stage) => store.cleanCount(lesson.id, st)
  const [stage, setStage] = useState<Stage>(
    () => stages.find((s) => store.cleanCount(lesson.id, s) < CLEAN_GOAL) ?? stages[stages.length - 1],
  )
  const [micStatus, setMicStatus] = useState<MicStatus>('off')
  const [midi, setMidi] = useState<{ state: 'off' | 'connecting' | 'on'; devices: string[] }>({
    state: 'off',
    devices: [],
  })
  const [bench, setBench] = useState<BenchStats | null>(null)
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
  const midiRef = useRef<MidiHandle | null>(null)
  const midiLiveRef = useRef(false)
  const benchRef = useRef(new MicBench())

  const onPass = useCallback(
    (r: PassResult) => {
      store.record({
        lessonId: lesson.id,
        stage,
        clean: r.clean,
        wrong: r.wrong,
        unverified: r.unverified,
        source: r.source,
        durationMs: Math.round(r.durationMs),
      })
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
      // Läuft MIDI mit, steuert MIDI die Übung und das Mikrofon wird nur dagegen gemessen
      onNote: (m, tMs) => (midiLiveRef.current ? benchRef.current.mic(m, tMs) : input({ midi: m, tMs, source: 'mic' })),
      onStatus: setMicStatus,
      onLevel: (level, heard) => {
        levelRef.current = level
        heardRef.current = heard
      },
    })
    micRef.current = mic
    return () => mic.stop()
  }, [input])

  // MIDI: Chrome/Edge per Web MIDI, in der iOS-App per CoreMIDI. Safari kann es nicht.
  const startMidi = useCallback(async () => {
    if (midiRef.current) return
    setMidi({ state: 'connecting', devices: [] })
    try {
      midiRef.current = await connectMidi(
        (n) => {
          if (micRef.current?.status === 'listening') benchRef.current.truth(n.midi, n.tMs)
          input({ midi: n.midi, tMs: n.tMs, source: 'midi' })
        },
        (devices) => {
          midiLiveRef.current = devices.length > 0
          setMidi({ state: 'on', devices })
        },
      )
      try {
        localStorage.setItem('pianobuddy.midi', '1')
      } catch {
        /* egal */
      }
    } catch (e) {
      console.warn('MIDI', e)
      midiRef.current = null
      midiLiveRef.current = false
      setMidi({ state: 'off', devices: [] })
      toast('MIDI nicht freigegeben', { description: 'Der Browser hat den Zugriff abgelehnt.', type: 'error' })
    }
  }, [input])

  const stopMidi = () => {
    midiRef.current?.stop()
    midiRef.current = null
    midiLiveRef.current = false
    setMidi({ state: 'off', devices: [] })
    try {
      localStorage.removeItem('pianobuddy.midi')
    } catch {
      /* egal */
    }
  }

  // Wer MIDI einmal verbunden hat, bekommt es beim nächsten Stück automatisch wieder
  useEffect(() => {
    let wanted = false
    try {
      wanted = localStorage.getItem('pianobuddy.midi') === '1'
    } catch {
      /* egal */
    }
    if (wanted && midiKind()) void startMidi()
    return () => {
      midiRef.current?.stop()
      midiRef.current = null
      midiLiveRef.current = false
    }
  }, [startMidi])

  const toggleMidi = () => {
    if (midi.state !== 'off') return stopMidi()
    if (!midiKind())
      return void toast('Safari kann kein MIDI', {
        description: 'Am iPhone und iPad geht MIDI in der Piano-Buddy-App, am Mac in Chrome.',
        duration: 7000,
      })
    void startMidi()
  }

  // Vergleichsmessung sichtbar machen, solange beide laufen
  const comparing = midi.state === 'on' && midi.devices.length > 0 && (micStatus === 'listening' || micStatus === 'calibrating')
  useEffect(() => {
    if (!comparing) return setBench(null)
    const t = window.setInterval(() => {
      benchRef.current.tick(performance.now())
      setBench(benchRef.current.stats())
    }, 250)
    return () => clearInterval(t)
  }, [comparing])

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
  const clean = cleanCount(stage)
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
        <SegmentedControl
          className="stages"
          aria-label="Hand"
          value={stage}
          onValueChange={(v) => v && setStage(v as Stage)}
        >
          <SegmentedControlIndicator className={`stage-indicator stage-indicator-${stage}`} />
          {stages.map((st) => (
            <SegmentedControlItem key={st} value={st} className={`stage stage-${st}`}>
              <span>{stageLabel[st]}</span>
              <span className="dots" aria-label={`${cleanCount(st)} von ${CLEAN_GOAL} sauber`}>
                {Array.from({ length: CLEAN_GOAL }, (_, i) => (
                  <i key={i} className={i < cleanCount(st) ? 'on' : ''} />
                ))}
              </span>
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </header>

      <main className="stage-area">
        <Roll view={view} beatsPerBar={lesson.beatsPerBar} onKey={onKey} />
        {comparing && bench && (
          <aside className="bench" aria-live="polite">
            <p className="bench-head">Mikrofon gegen MIDI</p>
            <p className="bench-main">
              {bench.played ? (
                <>
                  <strong>
                    {bench.detected} von {bench.played}
                  </strong>{' '}
                  erkannt
                  {bench.medianLatencyMs !== null && <> · {bench.medianLatencyMs} ms</>}
                  {bench.falseAlarms > 0 && (
                    <>
                      {' '}
                      · {bench.falseAlarms} {bench.falseAlarms === 1 ? 'Fehlalarm' : 'Fehlalarme'}
                    </>
                  )}
                </>
              ) : micStatus === 'calibrating' ? (
                'Kurz still sein, das Mikrofon misst den Raum.'
              ) : (
                'Spiel los. MIDI führt, das Mikrofon wird mitgemessen.'
              )}
            </p>
            {bench.recent.length > 0 && (
              <ul className="bench-log">
                {bench.recent.map((e, i) => (
                  <li key={i} className={`bench-${e.kind}`}>
                    {noteLabel(e.midi)}{' '}
                    {e.kind === 'hit'
                      ? `erkannt, ${e.latencyMs} ms`
                      : e.kind === 'missed'
                        ? 'verpasst'
                        : `Fehlalarm${e.note ? ` (${e.note})` : ''}`}
                  </li>
                ))}
              </ul>
            )}
            <button className="bench-reset" onClick={() => (benchRef.current.reset(), setBench(benchRef.current.stats()))}>
              Messung zurücksetzen
            </button>
          </aside>
        )}
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
            {result.unverified > 0 && (
              <p className="result-note">
                {result.unverified === 1 ? 'Ein Ton liegt' : `${result.unverified} Töne liegen`} eine Oktave oder Duodezime
                über der linken Hand. Dort hört das Mikrofon die rechte Hand auch, wenn nur links gespielt wird. Mit
                MIDI wird es genau.
              </p>
            )}
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
        <button className={`midi ${midi.state}`} onClick={toggleMidi} aria-pressed={midi.state !== 'off'}>
          <span className={`midi-dot ${midi.devices.length ? 'live' : ''}`} aria-hidden />
          {midi.state === 'off'
            ? 'MIDI'
            : midi.state === 'connecting'
              ? 'MIDI verbindet'
              : midi.devices.length
                ? midi.devices[0]
                : 'Kein Klavier gefunden'}
        </button>
        {midi.state === 'on' && !midi.devices.length && canPairBluetooth() && (
          <button className="ghost" onClick={() => void showBluetoothPairing()}>
            Bluetooth koppeln
          </button>
        )}
        <button className={`toggle ${demo ? 'on' : ''}`} onClick={startDemo}>
          {demo ? 'Vorspielen stoppen' : 'Vorspielen'}
        </button>
        <span className="spacer" />
        <Toggle className="toggle" pressed={showNames} onPressedChange={setShowNames}>
          Notennamen
        </Toggle>
        <Toggle className="toggle" pressed={showFingers} onPressedChange={setShowFingers}>
          Finger
        </Toggle>
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
