import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { notesForStage, stagesFor, type Lesson, type Stage } from '@piano/core/music/lessons'
import { WaitSession, type PassResult } from '@piano/core/practice/session'
import { TempoSession, TEMPO_LADDER, type JudgedNote, type Tempo, type TempoResult } from '@piano/core/practice/tempo'
import { MicBench, type BenchStats } from '@piano/core/practice/bench'
import { CLEAN_GOAL } from '@piano/core/practice/goal'
import { bestOf, praiseFor, type Praise } from '@piano/core/practice/score'
import { store } from '@piano/core/sync/store'
import { useStoreVersion } from '../../sync/hooks'
import { lookupFrom, loadProfile } from '@piano/core/audio/profile'
import { INTERVALS, dayKey, stateFor } from '@piano/core/practice/plan'
import { currentStates } from '@piano/core/practice/progress'
import { MicListener, type MicStatus } from '@piano/core/audio/mic'
import { audioContext, click, getPiano, holdNote, playNote, stopAll } from '@piano/core/audio/audio'
import type { NoteOff, NoteOn } from '@piano/core/input/events'
import { keyToMidi } from '@piano/core/input/keyboard'
import { fingerToMidi, keyToFinger } from '@piano/core/input/fingerKeys'
import { t, localized } from '@piano/core/i18n'
import { displayNoteLabel } from '@piano/core/i18n/noteNames'
import { announce } from '@ui-sdk/core'
import { PianoRoll, TAG_MS, type RollView } from './PianoRoll'
import { ResultCard } from './ResultCard'
import { BenchPanel } from './BenchPanel'
import { TempoBar } from './TempoBar'
import { StageMenu } from './StageMenu'
import { SettingsMenu } from './SettingsMenu'
import { useMidiInput } from './useMidiInput'
import { swapModules } from './swapModules'
import { AppBar } from '@piano/ui/shared/AppBar'
import { getPref, getPrefValue, setPref, setPrefValue } from './prefs'
import { VIEW_MODES, type ViewMode } from './ViewSwitch'
import { PracticeRecorder } from '../../diagnostics/recorder'
import { useReportUpload } from '../../diagnostics/upload'
import { usePrefersLight } from '@piano/ui/shared/usePrefersLight'
import { useThemeColor } from '@piano/ui/shared/useThemeColor'
import { BackIcon } from '@piano/ui/shared/icons'

// Notenansicht mit VexFlow: eigener Chunk, lädt erst beim Umschalten
const loadSheetView = () => import('./SheetView')
const SheetView = lazy(loadSheetView)

const TEMPO_VALUES = TEMPO_LADDER.map(String)
const tempoKey = (lessonId: string, stage: Stage) => `tempo.${lessonId}.${stage}`
const readTempo = (lessonId: string, stage: Stage): Tempo => {
  const v = getPrefValue(tempoKey(lessonId, stage), TEMPO_VALUES, 'wait')
  return v === 'wait' ? 'wait' : (Number(v) as Tempo)
}

/**
 * Übe-Seite. Zwei Arten zu üben, gewählt mit der Tempo-Leiter unten:
 * - Warten: Die Noten stehen, bis die richtigen Tasten kommen (WaitSession).
 * - Mitspielen in 60, 80 oder 100 %: ein Takt Einzähler, dann läuft das Stück durch, jeder Ton
 *   wird nach Anschlag und (mit MIDI) Haltedauer gewertet (TempoSession).
 *
 * Ruhig gehalten: oben Titel und Stufen-Chip, unten Leiter und ein Knopf. Stufen und
 * Einstellungen liegen in Sheets. Während ein Durchgang läuft, treten Kopf und Leiste zurück;
 * ein Tipp in die Bahn hält an. Eingaben (Mikrofon, MIDI, Bildschirm, Tastatur) landen in
 * derselben Sitzung. Laufen MIDI und Mikrofon zugleich, führt MIDI, das Mikrofon wird gemessen.
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
  const bestFor = useCallback((s: Stage) => bestOf(store.attemptsOf(lesson.id, s)), [lesson.id])
  const cleanTempos = useCallback(
    (s: Stage) => new Set(store.attemptsOf(lesson.id, s).filter((a) => a.clean).map((a) => (a.tempo ?? 'wait') as Tempo)),
    [lesson.id],
  )
  const dueOf = useCallback((s: Stage) => stateFor(currentStates(), lesson.id, s)?.due ?? null, [lesson.id])
  const [stage, setStage] = useState<Stage>(() =>
    initialStage && stages.includes(initialStage)
      ? initialStage
      : (stages.find((s) => store.cleanCount(lesson.id, s) < CLEAN_GOAL) ?? stages[stages.length - 1]),
  )
  const stageChange = useRef(onStageChange)
  stageChange.current = onStageChange
  useEffect(() => stageChange.current?.(stage), [stage])

  // Tempo je Stück und Stufe gemerkt; neu: Warten
  const [tempo, setTempoState] = useState<Tempo>(() => readTempo(lesson.id, stage))
  useEffect(() => setTempoState(readTempo(lesson.id, stage)), [lesson.id, stage])
  const [metronome, setMetronomeState] = useState(() => getPref('metronome', true))
  const setMetronome = (v: boolean) => (setPref('metronome', v), setMetronomeState(v))
  const metronomeRef = useRef(metronome)
  metronomeRef.current = metronome

  const [micStatus, setMicStatus] = useState<MicStatus>('off')
  const [bench, setBench] = useState<BenchStats | null>(null)
  const [showNames, setShowNamesState] = useState(() => getPref('names', true))
  const [showFingers, setShowFingersState] = useState(() => getPref('fingers', true))
  const setShowNames = (v: boolean) => (setPref('names', v), setShowNamesState(v))
  // Ansicht: fallende Noten (Standard), beides (Zwischenschritt) oder Noten
  const [mode, setModeState] = useState<ViewMode>(() =>
    getPrefValue('view', VIEW_MODES, getPref('sheet', false) ? 'sheet' : 'roll'),
  )
  const sheet = mode === 'sheet'
  const [sheetKeys, setSheetKeysState] = useState(() => getPref('sheetkeys2', false))
  const hasBand = mode !== 'roll'
  const hasKeys = !sheet || sheetKeys
  useEffect(() => {
    const id = window.setTimeout(loadSheetView, 1500)
    return () => window.clearTimeout(id)
  }, [])
  const setMode = (v: ViewMode) => {
    setPrefValue('view', v)
    swapModules(() => setModeState(v))
  }
  const setSheetKeys = (v: boolean) => {
    setPref('sheetkeys2', v)
    swapModules(() => setSheetKeysState(v))
  }
  // Diagnose: jede Übung mit Mikrofon samt Aufnahme senden (nur auf ausdrücklichen Schalter)
  const upload = useReportUpload()
  const [diagnostics, setDiagnosticsState] = useState(() => getPref('diagnostics', false))
  const setDiagnostics = (v: boolean) => (setPref('diagnostics', v), setDiagnosticsState(v))
  const diagnosticsRef = useRef(diagnostics)
  diagnosticsRef.current = diagnostics && !!upload
  const recorderRef = useRef<PracticeRecorder | null>(null)
  /** Letzte Eingabe: In der Notenansicht leuchtet die Taste erst, wenn man 3 s zögert */
  const lastInputRef = useRef(performance.now())
  const setShowFingers = (v: boolean) => (setPref('fingers', v), setShowFingersState(v))
  const [played, setPlayed] = useState(false)
  const paper = usePrefersLight()
  useThemeColor(paper ? '#f6eedf' : '#241a17')
  const [demo, setDemo] = useState(false)
  const [result, setResult] = useState<PassResult | TempoResult | null>(null)
  const [, force] = useState(0)

  const sessionRef = useRef<WaitSession | null>(null)
  const tempoRef = useRef<TempoSession | null>(null)
  const nextClickRef = useRef(0)
  /** Geplante Klicks, die noch nicht klangen: Pause und neuer Durchgang sagen sie ab */
  const clicksRef = useRef<(() => void)[]>([])
  const scheduleClick = (atMs: number, beat: number) => {
    const n = lesson.beatsPerBar
    clicksRef.current.push(click(atMs, ((beat % n) + n) % n === 0))
    if (clicksRef.current.length > 32) clicksRef.current.splice(0, 16)
  }
  const cancelClicks = () => {
    clicksRef.current.forEach((cancel) => cancel())
    clicksRef.current = []
  }
  useEffect(() => () => cancelClicks(), [])
  /** Nach „Weiter mit 80 %“: Sobald die Sitzung im neuen Tempo steht, gleich einzählen */
  const startPending = useRef(false)
  const stopDemoRef = useRef<() => void>(() => {})
  /** Hinweis „Tippen hält an“ nur beim ersten Durchgang im Tempo */
  const [pauseTip, setPauseTip] = useState(false)
  const pauseTipShown = useRef(false)
  const heardRef = useRef<number[]>([])
  const levelRef = useRef(0)
  const beatRef = useRef(0)
  const demoRef = useRef<{ t0: number; bpm: number } | null>(null)
  const micRef = useRef<MicListener | null>(null)
  const benchRef = useRef(new MicBench())
  const finishedAtRef = useRef(0)
  const pressRef = useRef(new Map<number, number>())
  const stageRef = useRef(stage)
  stageRef.current = stage

  const [progressNote, setProgressNote] = useState<string | undefined>()
  const [praise, setPraise] = useState<Praise | null>(null)
  const onPass = useCallback(
    (r: PassResult | TempoResult) => {
      const before = stateFor(currentStates(), lesson.id, stage)
      setPraise(praiseFor(store.attemptsOf(lesson.id, stage), r))
      store.record({
        lessonId: lesson.id,
        stage,
        clean: r.clean,
        wrong: r.wrong,
        unverified: r.unverified,
        source: r.source,
        durationMs: Math.round(r.durationMs),
        percent: r.percent,
        missedBars: r.missedBars,
        // Mitspielen: Tempo und je Ton Anschlag und Haltedauer (Grundlage für den Geist)
        ...('tempo' in r ? { tempo: r.tempo, timing: r.timing, held: r.held } : {}),
      })
      // Was der Durchgang für den Fortschritt heißt: sitzt für heute, gefestigt, morgen nochmal
      const after = stateFor(currentStates(), lesson.id, stage)
      let note: string | undefined
      if (before && after) {
        const wasDue = before.level >= 0 && before.due !== null && before.due <= dayKey(Date.now())
        if (before.level < 0 && after.level === 0) note = t.plan.learnedToday(t.stage[stage])
        else if (before.level >= 0 && after.level > before.level) note = t.plan.firmNow(INTERVALS[after.level])
        else if (wasDue && after.level === 0 && after.due !== before.due) note = t.plan.notYet
      }
      setProgressNote(note)
      finishedAtRef.current = performance.now()
      setResult(r)
      void flushRef.current('pass', r)
    },
    [lesson.id, stage],
  )
  const onPassRef = useRef(onPass)
  onPassRef.current = onPass

  /** Mitspielen: neuer Durchgang, ein Takt Einzähler (immer hörbar, auch ohne Metronom) */
  const startTempo = useCallback(() => {
    const prev = tempoRef.current
    if (!prev) return
    stopDemoRef.current()
    cancelClicks()
    audioContext()
    const s = new TempoSession(lesson, prev.stage, prev.tempo, (r) => onPassRef.current(r))
    s.start(performance.now())
    for (const k of s.countInClicks()) scheduleClick(s.timeOf(k), k)
    nextClickRef.current = s.firstBeat
    tempoRef.current = s
    setResult(null)
    if (!pauseTipShown.current) {
      pauseTipShown.current = true
      setPauseTip(true)
      window.setTimeout(() => setPauseTip(false), 5000)
    }
    force((x) => x + 1)
  }, [lesson])

  const pauseTempo = () => {
    tempoRef.current?.pause(performance.now())
    cancelClicks()
    force((x) => x + 1)
  }
  const resumeTempo = () => {
    const s = tempoRef.current
    if (!s?.paused) return
    stopDemoRef.current()
    cancelClicks()
    s.resume(performance.now())
    for (const k of s.countInClicks()) scheduleClick(s.timeOf(k), k)
    nextClickRef.current = s.firstBeat
    force((x) => x + 1)
  }

  // neue Sitzung je Stufe und Tempo
  useEffect(() => {
    cancelClicks()
    if (tempo === 'wait') {
      const s = new WaitSession(lesson, stage, (r) => onPassRef.current(r))
      s.restart()
      sessionRef.current = s
      tempoRef.current = null
      beatRef.current = s.beat
    } else {
      sessionRef.current = null
      tempoRef.current = new TempoSession(lesson, stage, tempo, (r) => onPassRef.current(r))
    }
    setResult(null)
    force((x) => x + 1)
    if (startPending.current) {
      startPending.current = false
      if (tempo !== 'wait') startTempo()
    }
  }, [lesson, stage, tempo, startTempo])

  const stopDemo = () => {
    if (!demoRef.current) return
    stopAll()
    demoRef.current = null
    setDemo(false)
  }
  stopDemoRef.current = stopDemo
  const setTempo = (v: Tempo, start = false) => {
    stopDemo()
    setPrefValue(tempoKey(lesson.id, stage), String(v))
    if (v === tempo) {
      if (start && v !== 'wait') startTempo()
      else if (start) again()
      return
    }
    startPending.current = start
    setTempoState(v)
  }

  /** Töne, auf die das Mikrofon gerade achten soll */
  const expectedNow = (): ReadonlySet<number> => {
    const ts = tempoRef.current
    if (!ts) return sessionRef.current?.expected ?? new Set()
    const b = ts.beatAt(performance.now())
    return new Set(ts.notes.filter((n) => n.state === 'pending' && n.start >= b - 0.5 && n.start <= b + 1).map((n) => n.midi))
  }

  const input = useCallback(
    (e: NoteOn) => {
      lastInputRef.current = performance.now()
      pressRef.current.set(e.midi, performance.now())
      if (demoRef.current) return
      setPlayed(true)
      const ts = tempoRef.current
      if (ts) {
        // Das Klavier ist die Fernbedienung: Eine Taste startet den Einzähler (sie selbst zählt
        // nicht). Nach dem Ende frühestens 1,2 s später, sonst zählt der Nachklang.
        if (!ts.started || ts.finished) {
          if (ts.finished && performance.now() - finishedAtRef.current < 1200) return
          if (e.source === 'mic' && !ts.finished) return
          startTempo()
          return
        }
        ts.input(e)
        return
      }
      const s = sessionRef.current
      if (!s) return
      if (s.finished) {
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
      if (s.index !== before && !s.finished) announce(t.practice.nextNotes([...s.expected].map(displayNoteLabel).join(', ')))
      force((x) => x + 1)
    },
    [lesson.id, stages, startTempo],
  )

  /** Losgelassen: Haltedauer (Mitspielen) bzw. lange Töne halten (Warten) */
  const release = useCallback((e: NoteOff) => {
    if (tempoRef.current) return tempoRef.current.release(e)
    sessionRef.current?.release(e)
  }, [])

  // MIDI: führt die Übung; läuft das Mikrofon mit, ist MIDI die Wahrheit für die Messung
  const { midi, toggle: toggleMidi, liveRef: midiLiveRef } = useMidiInput((n) => {
    if (n.velocity === 0) return release({ midi: n.midi, tMs: n.tMs, source: 'midi' })
    if (micRef.current?.status === 'listening') benchRef.current.truth(n.midi, n.tMs)
    input({ midi: n.midi, tMs: n.tMs, source: 'midi' })
  })

  /** Diagnose: Messung dieses Durchgangs senden und eine neue beginnen */
  const flushDiagnostics = async (reason: 'pass' | 'leave', result?: PassResult) => {
    const rec = recorderRef.current
    recorderRef.current = null
    if (!rec || !upload) return
    const mic = micRef.current
    if (reason === 'pass' && mic?.status === 'listening') {
      recorderRef.current = new PracticeRecorder()
      recorderRef.current.start(mic.mediaStream)
    }
    if (rec.empty) return
    try {
      const { data, audio, summary } = await rec.finish(
        { lessonId: lesson.id, stage, reason, result: result ?? null, profile: !!loadProfile(), mic: mic?.info ?? null },
        mic?.calibration ?? null,
      )
      await upload('practice', summary, data, audio)
    } catch (e) {
      console.warn('Diagnose senden', e)
    }
  }
  const flushRef = useRef(flushDiagnostics)
  flushRef.current = flushDiagnostics

  // Mikrofon
  const expectedRef = useRef(expectedNow)
  expectedRef.current = expectedNow
  useEffect(() => {
    const profile = lookupFrom(loadProfile())
    const mic = new MicListener({
      profile: () => profile,
      expected: () => expectedRef.current(),
      onNote: (m, tMs) => {
        recorderRef.current?.note(m, tMs, [...expectedRef.current()])
        if (midiLiveRef.current) benchRef.current.mic(m, tMs)
        else input({ midi: m, tMs, source: 'mic' })
      },
      onFrame: (f) => recorderRef.current?.frame(f),
      onStatus: (st) => {
        setMicStatus(st)
        if (st === 'listening' && diagnosticsRef.current && !recorderRef.current) {
          recorderRef.current = new PracticeRecorder()
          recorderRef.current.start(mic.mediaStream)
        }
      },
      onLevel: (level, heard) => {
        levelRef.current = level
        heardRef.current = heard
      },
    })
    micRef.current = mic
    if (getPref('mic', false)) void mic.start()
    return () => {
      void flushRef.current('leave')
      mic.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, midiLiveRef])

  // Messkarte „Mikrofon gegen MIDI“ nur mit eingeschalteter Diagnose: Sie ist Entwicklerwerkzeug
  const comparing =
    diagnostics && midi.state === 'on' && midi.devices.length > 0 && (micStatus === 'listening' || micStatus === 'calibrating')
  useEffect(() => {
    if (!comparing) return setBench(null)
    const timer = window.setInterval(() => {
      benchRef.current.tick(performance.now())
      setBench(benchRef.current.stats())
    }, 250)
    return () => clearInterval(timer)
  }, [comparing])

  const stageNotes = useMemo(() => notesForStage(lesson, stage), [lesson, stage])
  const lastBeat = useMemo(() => Math.max(...stageNotes.map((n) => n.start + n.dur)), [stageNotes])
  const [fingerKeys, setFingerKeysState] = useState(() => getPref('fingerkeys', true))
  const setFingerKeys = (v: boolean) => (setPref('fingerkeys', v), setFingerKeysState(v))
  const lowest = Math.min(...lesson.notes.map((n) => n.midi))
  /**
   * Position für die Fingertasten (welcher Ton ist mit Finger 3 gemeint?). Beim Mitspielen um das
   * Fenster „knapp“ voraus: Wer kurz vor dem Schlag anschlägt, meint schon den nächsten Ton.
   */
  const beatForKeys = () => {
    const ts = tempoRef.current
    if (ts) return ts.beatAt(performance.now()) + ts.win.near / ts.beat
    return sessionRef.current?.beat ?? 0
  }
  useEffect(() => {
    const base = Math.min(48, Math.floor(lowest / 12) * 12)
    const held = new Map<string, () => void>()
    const up = (e: KeyboardEvent) => {
      held.get(e.code)?.()
      held.delete(e.code)
    }
    const releaseAll = () => (held.forEach((r) => r()), held.clear())
    const hold = (code: string, m: number) => {
      const stopSound = micRef.current?.status !== 'listening' ? holdNote(m) : undefined
      held.set(code, () => {
        stopSound?.()
        release({ midi: m, tMs: performance.now(), source: 'keys' })
      })
    }
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      let m: number | null
      if (fingerKeys) {
        const f = keyToFinger(e.code)
        m = f ? fingerToMidi(stageNotes, Math.max(0, beatForKeys()), f.hand, f.finger) : null
      } else m = keyToMidi(e.code, base)
      if (m === null) return
      e.preventDefault()
      if (!held.has(e.code)) hold(e.code, m)
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
  }, [input, release, lowest, fingerKeys, stageNotes])

  // Display wach halten, solange geübt wird
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    navigator.wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => {})
    return () => void lock?.release()
  }, [])

  useEffect(() => {
    getPiano()
  }, [])

  /** Bildschirmtaste gedrückt; gibt das Loslassen zurück (Ton und Haltedauer) */
  const onKey = useCallback(
    (m: number) => {
      audioContext()
      const stopSound = micRef.current?.status !== 'listening' ? holdNote(m) : undefined
      input({ midi: m, tMs: performance.now(), source: 'touch' })
      return () => {
        stopSound?.()
        release({ midi: m, tMs: performance.now(), source: 'touch' })
      }
    },
    [input, release],
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

  /** Anhören: die Stufe einmal vorspielen, im gewählten Tempo (Warten: Originaltempo) */
  const toggleDemo = () => {
    if (demoRef.current) return stopDemo()
    const ts = tempoRef.current
    if (ts?.running) {
      ts.pause(performance.now())
      cancelClicks()
    }
    const ctx = audioContext()
    const bpm = lesson.bpm * (tempo === 'wait' ? 1 : tempo)
    const spb = 60 / bpm
    const t0 = ctx.currentTime + 0.6
    for (const n of notesForStage(lesson, stage)) playNote(n.midi, n.dur * spb * 0.95, t0 + n.start * spb, n.hand === 'L' ? 62 : 78)
    demoRef.current = { t0, bpm }
    setDemo(true)
  }

  // Anzeige-Zustand, gelesen im Zeichen-Loop der Pianorolle
  const view = useCallback((): RollView => {
    const now = performance.now()
    const d = demoRef.current
    const base = {
      rangeNotes: lesson.notes,
      heard: heardRef.current,
      showNames,
      showFingers,
      keysOnly: sheet,
    }
    const pressOf = (m: number) => {
      const at = pressRef.current.get(m)
      if (at === undefined) return 0
      const age = now - at
      return age < 300 ? 1 - (age / 300) ** 2 : 0
    }
    if (d) {
      // Vorspielen: die Bahn gleitet mit, „aktuell“ sind die klingenden Noten
      const beat = ((audioContext().currentTime - d.t0) * d.bpm) / 60
      if (beat > lastBeat + 1) {
        demoRef.current = null
        setDemo(false)
      }
      const expected = new Set(stageNotes.filter((n) => beat >= n.start && beat < n.start + n.dur).map((n) => n.midi))
      beatRef.current = beat
      return { ...base, notes: stageNotes, beat, expected, struck: new Set(), flashes: [], press: (m) => (expected.has(m) ? 1 : 0), hint: true }
    }

    const ts = tempoRef.current
    if (ts) {
      ts.tick(now)
      const beat = ts.beatAt(now)
      // Metronom: Klicks kurz vorausplanen, auf der Audio-Uhr. Mit Mikrofon still, sonst hört
      // es den Klick als Ton
      if (ts.running && beat >= ts.countTo - 0.3) {
        const quiet = !metronomeRef.current || micRef.current?.status === 'listening'
        while (nextClickRef.current < beat + 0.3) {
          const k = nextClickRef.current++
          // Verpasste Schläge (App war im Hintergrund) nicht als Salve nachholen
          if (!quiet && k < lastBeat && ts.timeOf(k) > now - 20) scheduleClick(ts.timeOf(k), k)
        }
      }
      const sounding = ts.started ? ts.soundingAt(beat) : ts.notes.filter((n) => n.start === ts.notes[0]?.start)
      const look = (n: JudgedNote) => ({
        missed: n.state === 'missed',
        heldBeats: n.hold === 'short' && n.onMs !== null && n.offMs !== null ? (n.offMs - n.onMs) / ts.beat : undefined,
      })
      return {
        ...base,
        notes: ts.notes,
        beat,
        expected: new Set(sounding.map((n) => n.midi)),
        struck: new Set(sounding.filter((n) => n.onMs !== null && n.offMs === null).map((n) => n.midi)),
        flashes: ts.feedback
          .filter((f) => f.kind === 'hit' || f.kind === 'wrong')
          .map((f) => ({ midi: f.midi, kind: f.kind as 'hit' | 'wrong', age: now - f.tMs })),
        tags: ts.feedback
          .filter((f) => f.kind === 'early' || f.kind === 'late' || f.kind === 'short' || f.kind === 'long')
          .map((f) => ({ midi: f.midi, text: t.tempo[f.kind as 'early' | 'late' | 'short' | 'long'], age: now - f.tMs }))
          .filter((x) => x.age < TAG_MS),
        judge: (n) => look(n as JudgedNote),
        overholds: ts.notes
          .filter((n) => n.onMs !== null && n.offMs === null && beat > n.start + n.dur)
          .map((n) => ({ midi: n.midi, hand: n.hand, beats: beat - (n.start + n.dur), long: n.hold === 'long' })),
        countIn: ts.countInShown(now),
        press: pressOf,
        hint: !sheet || now - lastInputRef.current > 3000,
      }
    }

    // Warte-Modus: weich zum aktuellen Schritt gleiten; beim Halten eines langen Tons läuft die
    // Bahn in Echtzeit weiter
    const s = sessionRef.current
    const graceBefore = s?.graceMisses
    s?.tick(now)
    if (s && s.graceMisses !== graceBefore) queueMicrotask(() => force((x) => x + 1))
    const hold = s?.holdProgress(now)
    const holdBeats = s?.holding ? s.holding.beats * 0.8 : 0
    const target = s?.finished ? (s.steps[s.steps.length - 1]?.start ?? 0) + 2 : (s?.beat ?? 0) + (hold ?? 0) * holdBeats
    beatRef.current += (target - beatRef.current) * 0.25
    if (Math.abs(target - beatRef.current) < 0.002) beatRef.current = target
    const arrived = Math.abs(beatRef.current - (s?.beat ?? 0)) < 0.4 || !!s?.holding
    const expected = s?.expected ?? new Set<number>()
    return {
      ...base,
      notes: stageNotes,
      beat: s?.holding ? beatRef.current : arrived ? (s?.beat ?? beatRef.current) : beatRef.current,
      expected: arrived ? expected : new Set(),
      struck: s?.struck ?? new Set(),
      flashes: (s?.feedback ?? [])
        .filter((f) => f.kind !== 'short')
        .map((f) => ({ midi: f.midi, kind: f.kind as 'hit' | 'wrong', age: now - f.tMs })),
      // Langer Ton zu früh losgelassen: leise „kurz“ über der Taste statt einer Einblendung
      tags: (s?.feedback ?? [])
        .filter((f) => f.kind === 'short')
        .map((f) => ({ midi: f.midi, text: t.tempo.short, age: now - f.tMs })),
      press: pressOf,
      // In den Noten leuchtet die Taste erst nach 3 s Zögern, oder wenn jemand die Starttaste sucht
      hint: !sheet || now - lastInputRef.current > 3000 || (!!s && !s.started && s.graceMisses > 0),
    }
  }, [lesson.notes, lesson.beatsPerBar, stageNotes, lastBeat, showNames, showFingers, sheet])

  const again = () => {
    if (tempoRef.current) return startTempo()
    sessionRef.current?.restart()
    setResult(null)
    force((x) => x + 1)
  }

  const ts = tempoRef.current
  const s = sessionRef.current
  const running = !!ts?.running
  const barState: 'idle' | 'running' | 'paused' | 'restart' | 'waiting' = ts
    ? ts.paused
      ? 'paused'
      : running
        ? 'running'
        : 'idle'
    : s && (s.index > 0 || result)
      ? 'restart'
      : 'waiting'
  const onPlay = () => {
    if (barState === 'running') pauseTempo()
    else if (barState === 'paused') resumeTempo()
    else again()
  }
  const onLaneTap = () => {
    if (!ts) return
    if (ts.running) pauseTempo()
    else if (ts.paused) resumeTempo()
  }
  const noInput = micStatus === 'off' && midi.state === 'off'
  const laneHint = result
    ? null
    : ts?.paused
      ? t.tempo.paused
      : running
        ? pauseTip
          ? t.tempo.tapToPause
          : null
        : ts
          ? `${t.tempo.hintPlay}${noInput ? ` ${t.tempo.hintNoInput}` : ''}`
          : !played
            ? `${t.tempo.hintWait}${noInput ? ` ${t.tempo.hintNoInput}` : ''}`
            : null

  return (
    <div className={`practice ${paper ? 'paper' : ''}${running ? ' hush' : ''}`}>
      <AppBar
        left={
          <button className="icon-button" onClick={onBack} aria-label={t.practice.back}>
            <BackIcon />
          </button>
        }
        title={
          <span className="title-stack">
            <span className="appbar-text">{localized(lesson.title)}</span>
            <StageMenu
              stages={stages}
              stage={stage}
              onChange={setStage}
              cleanCount={cleanCount}
              best={bestFor}
              cleanTempos={cleanTempos}
              due={dueOf}
              goal={localized(lesson.goal)}
              demo={demo}
              onToggleDemo={toggleDemo}
            />
          </span>
        }
        right={
          <SettingsMenu
            mode={mode}
            onMode={setMode}
            midi={midi}
            onToggleMidi={toggleMidi}
            micStatus={micStatus}
            levelRef={levelRef}
            onToggleMic={toggleMic}
            metronome={metronome}
            onMetronome={setMetronome}
            showNames={showNames}
            onShowNames={setShowNames}
            showFingers={showFingers}
            onShowFingers={setShowFingers}
            fingerKeys={fingerKeys}
            onFingerKeys={setFingerKeys}
            sheetKeys={sheetKeys}
            onSheetKeys={setSheetKeys}
            onCalibrate={onCalibrate}
            diagnostics={diagnostics}
            onDiagnostics={upload ? setDiagnostics : undefined}
          />
        }
      />

      <main className="stage-area">
        {/* Feste Plätze wie ein kleiner Modulkatalog: Notenband oben, Klaviatur unten, beide
            immer gleich groß; nur die Bahn dazwischen nimmt den Rest. */}
        <div
          className={`stage-grid${hasBand ? ' has-band' : ''}`}
          onPointerDown={!hasKeys ? onLaneTap : undefined}
        >
          {hasBand && (
            <div className="stage-band">
              <Suspense fallback={<div className="sheet-view" />}>
                <SheetView lesson={lesson} stage={stage} view={view} showNames={showNames} showFingers={showFingers} forceBand />
              </Suspense>
            </div>
          )}
          {hasKeys && (
            <div className="stage-roll">
              <PianoRoll
                view={view}
                beatsPerBar={lesson.beatsPerBar}
                onKey={onKey}
                onLaneTap={onLaneTap}
                expected={[...(tempoRef.current ? [] : (sessionRef.current?.expected ?? []))]}
                paper={paper}
              />
            </div>
          )}
        </div>
        {laneHint && <p className={`lane-hint${hasBand ? ' lane-hint-band' : ''}`}>{laneHint}</p>}
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
            onTempo={(v) => setTempo(v, true)}
            tempo={tempo}
            cleanTempos={cleanTempos(stage)}
            note={progressNote}
            best={bestFor(stage)}
            praise={praise}
          />
        )}
      </main>

      <TempoBar tempo={tempo} onTempo={(v) => setTempo(v)} cleanTempos={cleanTempos(stage)} state={barState} onPlay={onPlay} />
    </div>
  )
}
