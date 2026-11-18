import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { notesForStage, stagesFor, type Lesson, type Stage } from '@piano/core/music/lessons'
import { WaitSession, type PassResult } from '@piano/core/practice/session'
import { MicBench, type BenchStats } from '@piano/core/practice/bench'
import { CLEAN_GOAL } from '@piano/core/practice/goal'
import { store } from '@piano/core/sync/store'
import { useStoreVersion } from '../../sync/hooks'
import { lookupFrom, loadProfile } from '@piano/core/audio/profile'
import { MicListener, type MicStatus } from '@piano/core/audio/mic'
import { audioContext, getPiano, holdNote, playNote, stopAll } from '@piano/core/audio/audio'
import type { NoteOn } from '@piano/core/input/events'
import { keyToMidi } from '@piano/core/input/keyboard'
import { fingerToMidi, keyToFinger } from '@piano/core/input/fingerKeys'
import { t, localized } from '@piano/core/i18n'
import { displayNoteLabel } from '@piano/core/i18n/noteNames'
import { announce } from '@ui-sdk/core'
import { PianoRoll, type RollView } from './PianoRoll'
import { StageSwitcher } from './StageSwitcher'
import { ResultCard } from './ResultCard'
import { BenchPanel } from './BenchPanel'

// Notenansicht mit VexFlow: eigener Chunk, lädt erst beim Umschalten
const SheetView = lazy(() => import('./SheetView'))
import { PracticeToolbar } from './PracticeToolbar'
import { useMidiInput } from './useMidiInput'
import { ViewMenu } from './ViewMenu'
import { AppBar } from '@piano/ui/shared/AppBar'
import { getPref, setPref } from './prefs'
import { usePrefersLight } from '@piano/ui/shared/usePrefersLight'
import { useThemeColor } from '@piano/ui/shared/useThemeColor'
import { BackIcon } from '@piano/ui/shared/icons'

/**
 * Übe-Seite im Warte-Modus. Eingaben (Mikrofon, MIDI, Bildschirm, Tastatur) landen alle
 * in derselben WaitSession. Laufen MIDI und Mikrofon zugleich, führt MIDI und das Mikrofon
 * wird nur dagegen gemessen.
 */
export function PracticeScreen({
  lesson,
  initialStage,
  onStageChange,
  onBack,
  onNextLesson,
  onCalibrate,
}: {
  lesson: Lesson
  /** Stufe aus der Adresse; ohne sie die erste, die noch nicht sitzt */
  initialStage?: Stage
  onStageChange?: (s: Stage) => void
  onBack: () => void
  onNextLesson?: () => void
  /** Mikrofon einlernen (Lernmodus) */
  onCalibrate?: () => void
}) {
  const stages = useMemo(() => stagesFor(lesson), [lesson])
  useStoreVersion()
  const cleanCount = useCallback((s: Stage) => store.cleanCount(lesson.id, s), [lesson.id])
  const [stage, setStage] = useState<Stage>(() =>
    initialStage && stages.includes(initialStage)
      ? initialStage
      : (stages.find((s) => store.cleanCount(lesson.id, s) < CLEAN_GOAL) ?? stages[stages.length - 1]),
  )
  const stageChange = useRef(onStageChange)
  stageChange.current = onStageChange
  useEffect(() => stageChange.current?.(stage), [stage])
  const [micStatus, setMicStatus] = useState<MicStatus>('off')
  const [bench, setBench] = useState<BenchStats | null>(null)
  const [showNames, setShowNamesState] = useState(() => getPref('names', true))
  const [showFingers, setShowFingersState] = useState(() => getPref('fingers', true))
  const setShowNames = (v: boolean) => (setPref('names', v), setShowNamesState(v))
  // Noten statt fallender Balken; die Klaviatur darunter lässt sich ausblenden
  const [sheet, setSheetState] = useState(() => getPref('sheet', false))
  const [sheetKeys, setSheetKeysState] = useState(() => getPref('sheetkeys', true))
  const setSheet = (v: boolean) => (setPref('sheet', v), setSheetState(v))
  const setSheetKeys = (v: boolean) => (setPref('sheetkeys', v), setSheetKeysState(v))
  /** Letzte Eingabe: In der Notenansicht leuchtet die Taste erst, wenn man 3 s zögert */
  const lastInputRef = useRef(performance.now())
  const setShowFingers = (v: boolean) => (setPref('fingers', v), setShowFingersState(v))
  const [played, setPlayed] = useState(false)
  // Tag: Papier (hell), Abend: Lack (dunkel) – wie der Modus des Geräts
  const paper = usePrefersLight()
  useThemeColor(paper ? '#f6eedf' : '#241a17')
  const [demo, setDemo] = useState(false)
  const [result, setResult] = useState<PassResult | null>(null)
  const [, force] = useState(0)

  const sessionRef = useRef<WaitSession | null>(null)
  const heardRef = useRef<number[]>([])
  const levelRef = useRef(0)
  const beatRef = useRef(0)
  const demoRef = useRef<{ t0: number; bpm: number } | null>(null)
  const micRef = useRef<MicListener | null>(null)
  const benchRef = useRef(new MicBench())
  const finishedAtRef = useRef(0)
  // letzte Anschläge je Taste, für die Drück-Optik
  const pressRef = useRef(new Map<number, number>())
  // aktuelle Stufe für den Eingabe-Callback (der bleibt stabil, damit MIDI und Mikrofon nicht neu verbinden)
  const stageRef = useRef(stage)
  stageRef.current = stage

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
      finishedAtRef.current = performance.now()
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
    lastInputRef.current = performance.now()
    pressRef.current.set(e.midi, performance.now())
    const s = sessionRef.current
    if (!s || demoRef.current) return
    setPlayed(true)
    if (s.finished) {
      // Das Klavier ist die Fernbedienung: Der nächste Anschlag startet den nächsten Durchgang,
      // bei fertiger Stufe die nächste. Frühestens 1,2 s nach dem Ende, sonst zählt der Nachklang.
      if (performance.now() - finishedAtRef.current < 1200) return
      const st = stageRef.current
      const next = stages[stages.indexOf(st) + 1]
      if (next && store.cleanCount(lesson.id, st) >= CLEAN_GOAL) {
        setStage(next)
        return
      }
      s.restart()
      setResult(null)
    }
    const before = s.index
    s.input(e)
    // Screenreader: nach jedem geschafften Schritt die nächsten Töne ansagen
    if (s.index !== before && !s.finished) announce(t.practice.nextNotes([...s.expected].map(displayNoteLabel).join(', ')))
    force((x) => x + 1)
  }, [lesson.id, stages])

  // MIDI: führt die Übung; läuft das Mikrofon mit, ist MIDI die Wahrheit für die Messung
  const { midi, toggle: toggleMidi, liveRef: midiLiveRef } = useMidiInput((n) => {
    if (micRef.current?.status === 'listening') benchRef.current.truth(n.midi, n.tMs)
    input({ midi: n.midi, tMs: n.tMs, source: 'midi' })
  })

  // Mikrofon
  useEffect(() => {
    // Eingelerntes Klangprofil (Lernmodus), sonst feste Regeln
    const profile = lookupFrom(loadProfile())
    const mic = new MicListener({
      profile: () => profile,
      expected: () => sessionRef.current?.expected ?? new Set(),
      onNote: (m, tMs) => (midiLiveRef.current ? benchRef.current.mic(m, tMs) : input({ midi: m, tMs, source: 'mic' })),
      onStatus: setMicStatus,
      onLevel: (level, heard) => {
        levelRef.current = level
        heardRef.current = heard
      },
    })
    micRef.current = mic
    // Wer das Mikrofon zuletzt an hatte, bekommt es wieder (der Tipp aufs Stück war die Geste)
    if (getPref('mic', false)) void mic.start()
    return () => mic.stop()
  }, [input, midiLiveRef])

  const comparing = midi.state === 'on' && midi.devices.length > 0 && (micStatus === 'listening' || micStatus === 'calibrating')
  useEffect(() => {
    if (!comparing) return setBench(null)
    const timer = window.setInterval(() => {
      benchRef.current.tick(performance.now())
      setBench(benchRef.current.stats())
    }, 250)
    return () => clearInterval(timer)
  }, [comparing])

  const stageNotes = useMemo(() => notesForStage(lesson, stage), [lesson, stage])
  // Computertastatur: Fingertasten (Standard) oder Töne wie im Tracker (Y–M, Q–I)
  const [fingerKeys, setFingerKeysState] = useState(() => getPref('fingerkeys', true))
  const setFingerKeys = (v: boolean) => (setPref('fingerkeys', v), setFingerKeysState(v))
  const lowest = Math.min(...lesson.notes.map((n) => n.midi))
  useEffect(() => {
    const base = Math.min(48, Math.floor(lowest / 12) * 12)
    // Ton klingt, solange die Taste gehalten wird
    const held = new Map<string, () => void>()
    const up = (e: KeyboardEvent) => {
      held.get(e.code)?.()
      held.delete(e.code)
    }
    const releaseAll = () => (held.forEach((r) => r()), held.clear())
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      let m: number | null
      if (fingerKeys) {
        const f = keyToFinger(e.code)
        m = f ? fingerToMidi(stageNotes, sessionRef.current?.beat ?? 0, f.hand, f.finger) : null
      } else m = keyToMidi(e.code, base)
      if (m === null) return
      e.preventDefault()
      if (micRef.current?.status !== 'listening' && !held.has(e.code)) held.set(e.code, holdNote(m))
      input({ midi: m, tMs: performance.now(), source: 'keys' })
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', releaseAll)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', releaseAll)
      releaseAll()
    }
  }, [input, lowest, fingerKeys, stageNotes])

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

  /** Bildschirmtaste gedrückt; gibt das Loslassen zurück (Ton klingt, solange der Finger liegt) */
  const onKey = useCallback(
    (m: number) => {
      audioContext()
      const release = micRef.current?.status !== 'listening' ? holdNote(m) : undefined
      input({ midi: m, tMs: performance.now(), source: 'touch' })
      return release
    },
    [input],
  )

  const toggleMic = () => {
    const mic = micRef.current!
    if (mic.status === 'listening' || mic.status === 'calibrating') {
      mic.stop()
      setPref('mic', false)
    } else {
      void mic.start()
      setPref('mic', true)
    }
  }

  const toggleDemo = () => {
    if (demoRef.current) {
      stopAll()
      demoRef.current = null
      setDemo(false)
      return
    }
    const ctx = audioContext()
    const spb = 60 / lesson.bpm
    const t0 = ctx.currentTime + 0.6
    for (const n of notesForStage(lesson, stage)) playNote(n.midi, n.dur * spb * 0.95, t0 + n.start * spb, n.hand === 'L' ? 62 : 78)
    demoRef.current = { t0, bpm: lesson.bpm }
    setDemo(true)
  }

  // Anzeige-Zustand, gelesen im Zeichen-Loop der Pianorolle
  const view = useCallback((): RollView => {
    const s = sessionRef.current
    const now = performance.now()
    s?.tick(now)
    let beat: number
    let expected: ReadonlySet<number> = s?.expected ?? new Set()
    let struck: ReadonlySet<number> = s?.struck ?? new Set()
    const d = demoRef.current
    if (d) {
      // Vorspielen: die Bahn gleitet mit, „aktuell“ sind die klingenden Noten
      beat = ((audioContext().currentTime - d.t0) * d.bpm) / 60
      const last = Math.max(...stageNotes.map((n) => n.start + n.dur))
      if (beat > last + 1) {
        demoRef.current = null
        setDemo(false)
      }
      expected = new Set(stageNotes.filter((n) => beat >= n.start && beat < n.start + n.dur).map((n) => n.midi))
      struck = new Set()
      beatRef.current = beat
    } else {
      // Warte-Modus: weich zum aktuellen Schritt gleiten
      const target = s?.finished ? (s.steps[s.steps.length - 1]?.start ?? 0) + 2 : (s?.beat ?? 0)
      beatRef.current += (target - beatRef.current) * 0.25
      if (Math.abs(target - beatRef.current) < 0.002) beatRef.current = target
      beat = beatRef.current
    }
    const arrived = d ? true : Math.abs(beat - (s?.beat ?? 0)) < 0.4
    return {
      notes: stageNotes,
      rangeNotes: lesson.notes,
      beat: d ? beat : arrived ? (s?.beat ?? beat) : beat,
      expected: d || arrived ? expected : new Set(),
      struck,
      flashes: (s?.feedback ?? []).map((f) => ({ midi: f.midi, kind: f.kind, age: now - f.tMs })),
      heard: heardRef.current,
      // Vorspielen: klingende Tasten bleiben unten; sonst federt die Taste in ~300 ms zurück
      press: (m: number) => {
        if (d) return expected.has(m) ? 1 : 0
        const at = pressRef.current.get(m)
        if (at === undefined) return 0
        const age = now - at
        return age < 300 ? 1 - (age / 300) ** 2 : 0
      },
      showNames,
      showFingers,
      keysOnly: sheet,
      hint: !sheet || now - lastInputRef.current > 3000,
    }
  }, [lesson.notes, stageNotes, showNames, showFingers, sheet])

  const again = () => {
    sessionRef.current?.restart()
    setResult(null)
    force((x) => x + 1)
  }

  const s = sessionRef.current

  return (
    <div className={`practice ${paper ? 'paper' : ''}`}>
      <AppBar
        left={
          <button className="icon-button" onClick={onBack} aria-label={t.practice.back}>
            <BackIcon />
          </button>
        }
        title={<span className="appbar-text">{localized(lesson.title)}</span>}
        right={
          <ViewMenu
            showNames={showNames}
            onShowNames={setShowNames}
            showFingers={showFingers}
            onShowFingers={setShowFingers}
            fingerKeys={fingerKeys}
            onFingerKeys={setFingerKeys}
            sheet={sheet}
            onSheet={setSheet}
            sheetKeys={sheetKeys}
            onSheetKeys={setSheetKeys}
          />
        }
      />
      <div className="stage-row">
        <StageSwitcher stages={stages} stage={stage} cleanCount={cleanCount} onChange={setStage} />
        <p className="stage-goal">{localized(lesson.goal)}</p>
      </div>

      <main className="stage-area">
        {sheet ? (
          <div className={`sheet-stage${sheetKeys ? '' : ' no-keys'}`}>
            <Suspense fallback={<div className="sheet-view" />}>
              <SheetView lesson={lesson} stage={stage} view={view} showNames={showNames} showFingers={showFingers} />
            </Suspense>
            {sheetKeys && (
              <div className="sheet-keys">
                <PianoRoll
                  view={view}
                  beatsPerBar={lesson.beatsPerBar}
                  onKey={onKey}
                  expected={[...(sessionRef.current?.expected ?? [])]}
                  paper={paper}
                />
              </div>
            )}
          </div>
        ) : (
          <PianoRoll
            view={view}
            beatsPerBar={lesson.beatsPerBar}
            onKey={onKey}
            expected={[...(sessionRef.current?.expected ?? [])]}
            paper={paper}
          />
        )}
        {!played && !result && micStatus === 'off' && midi.state === 'off' && (
          <p className="lane-hint">{t.practice.noInputHint}</p>
        )}
        {comparing && bench && (
          <BenchPanel
            side={stage === 'R' ? 'left' : 'right'}
            bench={bench}
            calibrating={micStatus === 'calibrating'}
            onReset={() => (benchRef.current.reset(), setBench(benchRef.current.stats()))}
          />
        )}
        {result && (
          <ResultCard
            result={result}
            stage={stage}
            nextStage={stages[stages.indexOf(stage) + 1]}
            clean={cleanCount(stage)}
            onAgain={again}
            onNext={setStage}
            onNextLesson={onNextLesson}
          />
        )}
      </main>

      <PracticeToolbar
        micStatus={micStatus}
        levelRef={levelRef}
        onToggleMic={toggleMic}
        midi={midi}
        onToggleMidi={toggleMidi}
        demo={demo}
        onToggleDemo={toggleDemo}
        canRestart={!!s && (s.index > 0 || !!result)}
        onRestart={again}
        onCalibrate={onCalibrate}
      />
    </div>
  )
}
