import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { barOf, notesForStage, stagesFor, type Lesson, type Stage } from '@piano/core/music/lessons'
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
import { capsOf, type InputEvent, type NoteOff, type NoteOn, type Pedal } from '@piano/core/input/events'
import { keyToMidi } from '@piano/core/input/keyboard'
import { fingerToMidi, keyToFinger } from '@piano/core/input/fingerKeys'
import { t, localized } from '@piano/core/i18n'
import { displayNoteLabel } from '@piano/core/i18n/noteNames'
import { announce } from '@ui-sdk/core'
import { PianoRoll, TAG_MS, crampedKeys, keyboardHeight, type RollView } from './PianoRoll'
import { ResultCard } from './ResultCard'
import { BenchPanel } from './BenchPanel'
import { TempoBar } from './TempoBar'
import { StageMenu, type VersionChoice } from './StageMenu'
import { SettingsMenu } from './SettingsMenu'
import { useMidiInput } from './useMidiInput'
import { keepAwake } from '../../input/midi'
import { swapModules } from './swapModules'
import { createParts } from '@ui-sdk/react/primitive'
import { practiceSession, type SessionPhase } from './practiceSession'
import { AppBar } from '@piano/ui/shared/AppBar'
import { getPref, getPrefValue, setPref, setPrefValue } from './prefs'
import { VIEW_MODES, type ViewMode } from './ViewSwitch'
import { KEY_HELPS, type KeyHelp } from './KeyHelpSwitch'
import { PracticeRecorder } from '../../diagnostics/recorder'
import { useReportUpload } from '../../diagnostics/upload'
import { usePrefersLight } from '@piano/ui/shared/usePrefersLight'
import { useThemeColor } from '@piano/ui/shared/useThemeColor'
import { BackIcon } from '@piano/ui/shared/icons'
import { debugRing } from '../../debug/ring'
import type { StepInfo } from '../../debug/DebugLayer'
import { getVariant, isBlind, useVariant, variantName, type Variant } from './variants'

// Notenansicht mit VexFlow: eigener Chunk, lädt erst beim Umschalten
const loadSheetView = () => import('./SheetView')
const SheetView = lazy(loadSheetView)
// Debug-Ebene (STU-1286): eigener Chunk, lädt erst beim Einschalten
const DebugLayer = lazy(() => import('../../debug/DebugLayer'))
/** So oft auf den Titel tippen (je höchstens 600 ms Abstand), um die Debug-Ebene zu schalten */
const DEBUG_TAPS = 5
/** So lange das Haltepedal treten, um aus der Debug-Ebene zu melden */
const PEDAL_REPORT_MS = 1200

/** Fristen und Nachsicht des Warte-Modus aus der Variante */
const waitOptions = (v: Variant) => ({ carryMs: v.carryMs, wrongDelayMs: v.wrongDelayMs, strayDelay: v.strayDelay, repeatOk: v.repeatOk })
/** Jede Sitzung meldet ihre Urteile an den Ring der Debug-Ebene */
function wired<S extends WaitSession | TempoSession>(s: S): S {
  s.onJudge = (j) => debugRing.judge(j)
  return s
}

const TEMPO_VALUES = TEMPO_LADDER.map(String)
const sessionParts = createParts(practiceSession, { root: 'main' })

/** Warum ein Durchgang angehalten wurde */
type PauseReason = 'tap' | 'background' | 'midi' | 'demo' | 'seek'
/** Nach dem Anhalten so lange nicht per Tipp fortsetzen (Doppeltipp, Wischen) */
const RESUME_LOCK_MS = 400
/** Nach dem Spulen federt die Bahn so lange vom Rand zurück bzw. zum nächsten Schlag (Mitspielen) */
const SETTLE_MS = 260
/** So weit (in Schlägen) gibt die Bahn über Anfang und Ende höchstens nach */
const RUBBER_BEATS = 1.5
/** So lange bleiben die Taktnummern nach dem Spulen stehen, dann blenden sie aus */
const BAR_LABELS_MS = 900
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
 * Einstellungen liegen in Sheets. Eingaben (Mikrofon, MIDI, Bildschirm, Tastatur) landen in
 * derselben Sitzung. Laufen MIDI und Mikrofon zugleich, führt MIDI, das Mikrofon wird gemessen.
 *
 * Regeln wie in einem Spiel (Interaktions-Karte): Während ein Durchgang läuft, hält jeder Tipp
 * irgendwo außer auf der Klaviatur an. Das Klavier ist die Fernbedienung: Eine Taste startet,
 * setzt fort und beendet das Vorspielen. Das Mikrofon startet beim Mitspielen nie etwas (es hört
 * auch Sprechen und Nachklang). App im Hintergrund oder Klavier getrennt hält an, ohne dass ein
 * verpatzter Durchgang ins Protokoll kommt.
 */
export function PracticeScreen({
  lesson,
  initialStage,
  onStageChange,
  onBack,
  onNextLesson,
  onCalibrate,
  versions,
}: {
  lesson: Lesson
  /** Stufe aus der Adresse; ohne sie die erste, die noch nicht sitzt */
  initialStage?: Stage
  onStageChange?: (s: Stage) => void
  onBack: () => void
  onNextLesson?: () => void
  /** Mikrofon einlernen (Lernmodus) */
  onCalibrate?: () => void
  /** Fassung des Stücks wählen (im Stufen-Sheet) */
  versions?: VersionChoice
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
  const hasBand = mode !== 'roll'
  // Klaviatur steht in jeder Ansicht fest unten: Anfänger brauchen die Verbindung Note → Taste.
  // In „Noten“ nimmt das Notenblatt den Platz der Bahn, die Klaviatur bleibt gleich groß.
  const keysH = useKeysHeight()
  useEffect(() => {
    const id = window.setTimeout(loadSheetView, 1500)
    return () => window.clearTimeout(id)
  }, [])
  const setMode = (v: ViewMode) => {
    setPrefValue('view', v)
    swapModules(() => setModeState(v))
  }
  const modeRef = useRef(mode)
  modeRef.current = mode
  // Klaviatur-Hilfe, unabhängig von der Ansicht (STU-1281). Startwert: sofort; wer bisher in
  // „Noten“ geübt hat, behält das bisherige Verhalten (Taste erst nach Zögern)
  const [keyHelp, setKeyHelpState] = useState<KeyHelp>(() => getPrefValue('keyHelp', KEY_HELPS, mode === 'sheet' ? 'delayed' : 'now'))
  const setKeyHelp = (v: KeyHelp) => (setPrefValue('keyHelp', v), setKeyHelpState(v))
  const keyHelpRef = useRef(keyHelp)
  keyHelpRef.current = keyHelp
  // Diagnose: jede Übung mit Mikrofon samt Aufnahme senden (nur auf ausdrücklichen Schalter)
  const upload = useReportUpload()
  const [diagnostics, setDiagnosticsState] = useState(() => getPref('diagnostics', false))
  const setDiagnostics = (v: boolean) => (setPref('diagnostics', v), setDiagnosticsState(v))
  const diagnosticsRef = useRef(diagnostics)
  diagnosticsRef.current = diagnostics && !!upload
  const recorderRef = useRef<PracticeRecorder | null>(null)
  // Debug-Ebene: versteckt, fünfmal auf den Titel tippen (auch in der iOS-App)
  const [debug, setDebugState] = useState(() => getPref('debug', false))
  const setDebug = (v: boolean) => (setPref('debug', v), setDebugState(v))
  const titleTaps = useRef<number[]>([])
  const onTitleTap = () => {
    const now = performance.now()
    const prev = titleTaps.current
    titleTaps.current = prev.length && now - prev[prev.length - 1] < 600 ? [...prev, now] : [now]
    if (titleTaps.current.length >= DEBUG_TAPS) {
      titleTaps.current = []
      setDebug(!debug)
    }
  }
  const reportRef = useRef<(() => void) | null>(null)
  const variant = useVariant()
  const variantRef = useRef(variant)
  variantRef.current = variant
  /** Tasten, die im letzten Bild leuchteten (Debug: angenommen, bevor die Taste leuchtete?) */
  const litRef = useRef<ReadonlySet<number>>(new Set())
  const phaseRef = useRef('waiting')
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
  /** Warum gerade angehalten ist (Hinweis in der Bahn) und wann (Doppeltipp-Sperre) */
  const pauseReasonRef = useRef<PauseReason>('tap')
  const pausedAtRef = useRef(0)
  /** Ton, der nach dem Ergebnis die Stufe gewechselt hat: zählt in der neuen Stufe als erster */
  const carryRef = useRef<NoteOn | null>(null)
  /** Erklärsätze in der Bahn nur, bis man die Art zu üben einmal benutzt hat */
  const [hinted, setHinted] = useState(() => ({ wait: getPref('hint.wait', false), play: getPref('hint.play', false) }))
  const markHinted = (k: 'wait' | 'play') => {
    if (getPref(`hint.${k}`, false)) return
    setPref(`hint.${k}`, true)
    setHinted((h) => ({ ...h, [k]: true }))
  }
  const markHintedRef = useRef(markHinted)
  markHintedRef.current = markHinted
  const heardRef = useRef<number[]>([])
  const levelRef = useRef(0)
  const beatRef = useRef(0)
  /** Zeit des letzten Bildes (Warte-Modus: Bahn läuft im Tempo) */
  const lastFrameRef = useRef(0)
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
      // Gespult: eine geübte Stelle. Sie zählt nicht für Sterne, Bestwert und Plan
      if (r.from) {
        setPraise(null)
        setProgressNote(undefined)
        finishedAtRef.current = performance.now()
        setResult(r)
        void flushRef.current('pass', r)
        return
      }
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
        // Womit geübt wurde: Ansicht, Klaviatur-Hilfe und wie oft die Taste half
        view: modeRef.current,
        keyHelp: keyHelpRef.current,
        hinted: r.hinted ?? 0,
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

  /**
   * Mitspielen: neuer Durchgang, ein Takt Einzähler (immer hörbar, auch ohne Metronom). Wurde
   * zuletzt eine Stelle geübt (gespult), beginnt er wieder dort, außer `full` (von vorn).
   */
  const startTempo = useCallback((full = false) => {
    const prev = tempoRef.current
    if (!prev) return
    stopDemoRef.current()
    cancelClicks()
    audioContext()
    const s = wired(new TempoSession(lesson, prev.stage, prev.tempo, (r) => onPassRef.current(r)))
    if (!full && prev.partial) {
      s.seek(prev.from)
      s.resume(performance.now())
    } else s.start(performance.now())
    for (const k of s.countInClicks()) scheduleClick(s.timeOf(k), k)
    nextClickRef.current = s.firstBeat
    tempoRef.current = s
    setResult(null)
    markHintedRef.current('play')
    force((x) => x + 1)
  }, [lesson])

  const pauseTempo = (reason: PauseReason = 'tap') => {
    const s = tempoRef.current
    if (!s?.running) return
    s.pause(performance.now())
    pauseReasonRef.current = reason
    pausedAtRef.current = performance.now()
    cancelClicks()
    force((x) => x + 1)
  }
  const pauseRef = useRef(pauseTempo)
  pauseRef.current = pauseTempo
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
  const resumeRef = useRef(resumeTempo)
  resumeRef.current = resumeTempo

  // neue Sitzung je Stufe und Tempo; Vorspielen der alten Stufe endet mit ihr
  useEffect(() => {
    cancelClicks()
    stopDemoRef.current()
    if (tempo === 'wait') {
      const s = wired(new WaitSession(lesson, stage, (r) => onPassRef.current(r), waitOptions(getVariant())))
      s.restart()
      sessionRef.current = s
      tempoRef.current = null
      beatRef.current = s.beat
    } else {
      sessionRef.current = null
      tempoRef.current = wired(new TempoSession(lesson, stage, tempo, (r) => onPassRef.current(r)))
    }
    setResult(null)
    force((x) => x + 1)
    if (startPending.current) {
      startPending.current = false
      if (tempo !== 'wait') startTempo()
    }
    // Der Ton, der die Stufe gewechselt hat, gilt in der neuen Stufe (Warten: erster Ton,
    // Mitspielen: startet den Einzähler)
    const carried = carryRef.current
    carryRef.current = null
    if (carried) queueMicrotask(() => inputRef.current({ ...carried, tMs: performance.now() }))
    // Sitzung wird ersetzt oder die Seite verlassen: Offenes bekommt sein Urteil
    const own = sessionRef.current
    return () => own?.drain()
  }, [lesson, stage, tempo, startTempo])

  // Variante umgeschaltet: Fristen gelten sofort, ohne neuen Durchgang
  useEffect(() => {
    const s = sessionRef.current
    if (s) Object.assign(s, waitOptions(variant))
    debugRing.mark('setting', `${variantName(variant) || 'custom'}${isBlind() ? ' (blind)' : ''}`)
  }, [variant])

  // Seite verlassen (Zurück, nächstes Stück, andere Fassung): Vorspielen verstummt
  useEffect(
    () => () => {
      if (demoRef.current) stopAll()
      demoRef.current = null
    },
    [],
  )

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
      // Ein Anschlag, ein Eintrag: Der Ton, der die Stufe gewechselt hat, kommt mit seiner Kennung wieder
      const strike =
        debugRing.get(e.id) ?? debugRing.strike(e, { expected: expectedRef.current(), lit: litRef.current.has(e.midi), phase: phaseRef.current })
      strike.verdict = undefined
      e = { ...e, id: strike.id }
      // Beim Spulen zählt nichts: Die Stelle steht erst beim Loslassen fest
      if (scrubRef.current) return debugRing.control(strike, 'scrub')
      // Vorspielen: Eine Taste beendet es, wie man ein Intro überspringt (sie selbst zählt nicht)
      if (demoRef.current) {
        if (capsOf(e.source).deliberate) stopDemoRef.current()
        debugRing.control(strike, 'demo')
        return
      }
      setPlayed(true)
      const ts = tempoRef.current
      if (ts) {
        // Das Klavier ist die Fernbedienung: Eine Taste startet den Einzähler bzw. setzt nach der
        // Pause fort (sie selbst zählt nicht). Das Mikrofon nie: Es hört auch Sprechen und
        // Nachklang. Nach dem Ende frühestens 1,2 s später, sonst zählt der Nachklang.
        if (!ts.started || ts.finished || ts.paused) {
          if (!capsOf(e.source).deliberate) return debugRing.control(strike, 'mic')
          if (ts.finished && performance.now() - finishedAtRef.current < 1200) return debugRing.control(strike, 'echo')
          debugRing.control(strike, ts.paused ? 'resume' : 'start')
          if (ts.paused) resumeRef.current()
          else startTempo()
          return
        }
        ts.input(e)
        return
      }
      markHintedRef.current('wait')
      const s = sessionRef.current
      if (!s) return
      if (s.finished) {
        if (performance.now() - finishedAtRef.current < 1200) return debugRing.control(strike, 'echo')
        const st = stageRef.current
        const next = stages[stages.indexOf(st) + 1]
        // Eine geübte Stelle wiederholt sich, bis man zurück an den Anfang spult
        if (s.partial) {
          s.again()
          setResult(null)
        } else if (next && store.cleanCount(lesson.id, st) >= CLEAN_GOAL) {
          // Das Mikrofon wechselt keine Stufe: Es hört auch Sprechen und Nachklang. Weiter dann
          // mit einer Taste per MIDI oder Bildschirm oder dem Knopf auf der Karte
          if (!capsOf(e.source).deliberate) return debugRing.control(strike, 'mic')
          // Angesagt auf der Ergebniskarte; der Ton zählt in der neuen Stufe
          debugRing.mark('setting', `stage ${next}`)
          carryRef.current = e
          setStage(next)
          return
        } else {
          s.restart()
          setResult(null)
        }
      }
      const before = s.index
      s.input(e)
      if (s.index !== before && !s.finished) {
        const names = [...s.expected].map(displayNoteLabel).join(', ')
        announce(t.practice.nextNotes(names))
        debugRing.mark('step', names)
      }
      force((x) => x + 1)
    },
    [lesson.id, stages, startTempo],
  )
  const inputRef = useRef(input)
  inputRef.current = input
  // Entwicklung: Töne aus Quellen, die die UI-SDK-Brücke nicht auslösen kann (Mikrofon, MIDI),
  // für die Tests der Interaktions-Karte (apps/app/e2e)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as Window & { pianoInput?: (midi: number, source: NoteOn['source']) => void; pianoShownBeat?: () => number }
    w.pianoInput = (midi, source) => inputRef.current({ midi, tMs: performance.now(), source })
    // Die Stelle, die die Bahn gerade zeigt (Spulen prüfen)
    w.pianoShownBeat = () => shownBeatRef.current
    return () => void (delete w.pianoInput, delete w.pianoShownBeat)
  }, [])

  /** Losgelassen: Haltedauer (Mitspielen) bzw. lange Töne halten (Warten) */
  const release = useCallback((e: NoteOff) => {
    debugRing.release(e)
    if (tempoRef.current) return tempoRef.current.release(e)
    sessionRef.current?.release(e)
  }, [])

  // MIDI: führt die Übung; läuft das Mikrofon mit, ist MIDI die Wahrheit für die Messung
  // Haltepedal lange treten: melden (nur mit Debug-Ebene)
  const pedalTimer = useRef<number | undefined>(undefined)
  const pedalDown = useRef(false)
  /** Haltepedal: zählt nicht als Halten (Anfänger halten mit dem Finger); lange treten meldet */
  const pedal = (p: Pedal) => {
    // Stufenloses Pedal sendet beim Treten viele Werte: nur der Wechsel zählt
    if (p.down === pedalDown.current) return
    pedalDown.current = p.down
    debugRing.mark('pedal', p.down ? '▼' : '▲', p.tMs)
    window.clearTimeout(pedalTimer.current)
    if (p.down) pedalTimer.current = window.setTimeout(() => reportRef.current?.(), PEDAL_REPORT_MS)
  }
  const { midi, toggle: toggleMidi, liveRef: midiLiveRef } = useMidiInput((e: InputEvent) => {
    if (e.type === 'off') return release(e)
    if (e.type === 'pedal') return pedal(e)
    // Mikrofon läuft mit: MIDI ist die Wahrheit für die Messkarte
    if (micRef.current?.status === 'listening') benchRef.current.truth(e.midi, e.tMs)
    input({ midi: e.midi, tMs: e.tMs, source: e.source, velocity: e.velocity })
  })
  useEffect(() => () => window.clearTimeout(pedalTimer.current), [])
  // Klavier getrennt, während es läuft: anhalten, statt lauter verpasste Töne zu werten
  const midiCount = midi.devices.length
  const midiCountRef = useRef(midiCount)
  /** Klavier war da und ist weg: Warten zeigt es in der Bahn (Mitspielen hält an und sagt es dort) */
  const [midiLost, setMidiLost] = useState(false)
  useEffect(() => {
    if (midiCount > 0) setMidiLost(false)
    if (midiCountRef.current > 0 && midiCount === 0) {
      setMidiLost(true)
      pauseRef.current('midi')
      // Ohne Klavier kein Loslassen des Pedals mehr: lange Treten zählt nicht
      window.clearTimeout(pedalTimer.current)
      pedalDown.current = false
    }
    midiCountRef.current = midiCount
  }, [midiCount])

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
    // Töne kommen wie bei jeder Quelle als Ereignisse; läuft MIDI, führt MIDI, das Mikrofon wird gemessen
    const unsubscribe = mic.subscribe((e) => {
      if (e.type !== 'on') return
      recorderRef.current?.note(e.midi, e.tMs, [...expectedRef.current()])
      if (midiLiveRef.current) benchRef.current.mic(e.midi, e.tMs)
      else input({ midi: e.midi, tMs: e.tMs, source: e.source })
    })
    micRef.current = mic
    if (getPref('mic', false)) void mic.start()
    return () => {
      unsubscribe()
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
  // iPhone hochkant, großer Umfang (meist beide Hände): Tasten würden zu schmal, also quer halten
  const cramped = useCramped(stageNotes)
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
      input({ midi: m, tMs: performance.now(), source: 'keys' })
      if (!held.has(e.code)) hold(e.code, m)
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

  // Display wach halten, solange geübt wird. Das System gibt den Wake Lock beim App-Wechsel frei:
  // beim Zurückkommen neu anfordern. In der iOS-App zusätzlich nativ (Leerlauf-Timer aus).
  // App verlassen: Mitspielen hält an (sonst gälten beim Zurückkommen alle Töne als verpasst und
  // der Durchgang käme ins Protokoll), Vorspielen endet.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    const request = () =>
      navigator.wakeLock
        ?.request('screen')
        .then((l) => (lock = l))
        .catch(() => {})
    void request()
    void keepAwake(true)
    const onHide = () => {
      pauseRef.current('background')
      stopDemoRef.current()
    }
    const onVisibility = () => (document.visibilityState === 'hidden' ? onHide() : void request())
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onHide)
      void lock?.release()
      void keepAwake(false)
    }
  }, [])

  useEffect(() => {
    getPiano()
  }, [])

  /** Bildschirmtaste gedrückt; gibt das Loslassen zurück (Ton und Haltedauer) */
  const onKey = useCallback(
    (m: number) => {
      audioContext()
      // Erst werten, dann klingen: Beendet die Taste das Vorspielen, verstummt sie nicht mit
      input({ midi: m, tMs: performance.now(), source: 'touch' })
      const stopSound = micRef.current?.status !== 'listening' ? holdNote(m) : undefined
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
    pauseTempo('demo')
    const ctx = audioContext()
    const bpm = lesson.bpm * (tempo === 'wait' ? 1 : tempo)
    const spb = 60 / bpm
    const t0 = ctx.currentTime + 0.6
    for (const n of notesForStage(lesson, stage)) playNote(n.midi, n.dur * spb * 0.95, t0 + n.start * spb, n.hand === 'L' ? 62 : 78)
    demoRef.current = { t0, bpm }
    setDemo(true)
  }

  // Anzeige-Zustand, gelesen im Zeichen-Loop der Pianorolle
  const rawView = useCallback((): RollView => {
    const now = performance.now()
    const d = demoRef.current
    const base = {
      rangeNotes: lesson.notes,
      heard: heardRef.current,
      showNames,
      showFingers,
      keysOnly: sheet,
      feel: { hit: variantRef.current.hit, check: variantRef.current.check, wrong: variantRef.current.wrong },
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
      const kh = keyHelpRef.current
      const tempoHint = kh === 'now' || (kh === 'delayed' && now - lastInputRef.current > variantRef.current.helpMs)
      if (tempoHint) ts.markHinted(sounding)
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
        hint: tempoHint,
      }
    }

    // Warte-Modus: weich zum aktuellen Schritt gleiten; beim Halten eines langen Tons läuft die
    // Bahn in Echtzeit weiter
    const s = sessionRef.current
    const graceBefore = s?.graceMisses
    const holdingBefore = !!s?.holding
    s?.tick(now)
    // Zustand, den die Seite anzeigt (Hinweis, Phase), hat sich im Takt geändert: neu zeichnen
    if (s && (s.graceMisses !== graceBefore || !!s.holding !== holdingBefore)) queueMicrotask(() => force((x) => x + 1))
    const hold = s?.holdProgress(now)
    // Beim Halten läuft die Bahn genau bis zum Ende des Tons: Ist das Halten geschafft, steht der
    // nächste Ton an der Linie, ohne Rest und ohne Stopp
    const holdBeats = s?.holding ? s.holding.beats : 0
    const target = s?.finished ? (s.steps[s.steps.length - 1]?.start ?? 0) + 2 : (s?.beat ?? 0) + (hold ?? 0) * holdBeats
    // Nach vorn im Takt des Stücks, nicht in einem Ruck: Die Noten laufen gleichmäßig herunter wie
    // beim Mitspielen, nur wartet die Bahn am nächsten Ton. Wer schneller spielt, als die Bahn
    // läuft, den holt sie ein (ab einem Schlag Rückstand entsprechend schneller). Zurück (Neustart)
    // gleitet sie zügig.
    const dt = Math.min(100, now - (lastFrameRef.current || now))
    lastFrameRef.current = now
    const dist = target - beatRef.current
    if (dist < 0) beatRef.current += dist * 0.25
    else beatRef.current = Math.min(target, beatRef.current + (lesson.bpm / 60_000) * Math.max(1, dist) * dt)
    if (Math.abs(target - beatRef.current) < 0.002) beatRef.current = target
    const arrived = Math.abs(beatRef.current - (s?.beat ?? 0)) < 0.4 || !!s?.holding
    const expected = s?.expected ?? new Set<number>()
    const vr = variantRef.current
    // Variante B: Der Schritt ist „jetzt“, sobald er spielbar ist, nicht erst an der Linie
    const playable = vr.lit === 'playable' && !!s?.step && !s.finished
    const kh = keyHelpRef.current
    const help =
      vr.help === 'stuck'
        ? // Hilfe nach Zögern seit Beginn des Schritts oder sofort nach einem Fehler; Suchtöne schieben sie nicht hinaus
          !!s && (now - s.stepStartedAt > vr.helpMs || s.stepMissed)
        : now - lastInputRef.current > vr.helpMs
    // Klaviatur-Hilfe: sofort, nach Zögern (oder wenn jemand die Starttaste sucht), aus
    const hint = kh === 'now' || (kh === 'delayed' && (help || (!!s && !s.started && s.graceMisses > 0)))
    if (hint && (arrived || playable) && expected.size) s?.markHinted()
    return {
      ...base,
      notes: stageNotes,
      // Nie einrasten: Ein Sprung auf den Zielschlag wäre der Ruck kurz vor jedem Ton
      beat: beatRef.current,
      ...(playable ? { stepStart: s!.step!.start } : {}),
      expected: arrived || playable ? expected : new Set(),
      struck: s?.struck ?? new Set(),
      flashes: (s?.feedback ?? [])
        .filter((f) => f.kind !== 'short')
        .map((f) => ({ midi: f.midi, kind: f.kind as 'hit' | 'wrong', age: now - f.tMs })),
      // Langer Ton zu früh losgelassen: leise „kurz“ über der Taste statt einer Einblendung
      tags: (s?.feedback ?? [])
        .filter((f) => f.kind === 'short')
        .map((f) => ({ midi: f.midi, text: t.tempo.short, age: now - f.tMs })),
      press: pressOf,
      hint,
    }
  }, [lesson.notes, lesson.beatsPerBar, lesson.bpm, stageNotes, lastBeat, showNames, showFingers, sheet])

  // Spulen: Während des Ziehens (und des Auslaufens nach einem Wisch) zeigt die Bahn die Stelle
  // unter dem Finger. Beim Loslassen bleibt sie dort; nur vom Rand federt sie zurück (SETTLE_MS)
  const scrubRef = useRef<{ from: number; beat: number } | null>(null)
  const settleRef = useRef<{ from: number; t0: number } | null>(null)
  const labelsUntilRef = useRef(0)
  const shownBeatRef = useRef(0)
  const barLabel = useCallback(
    (beat: number) => {
      const bar = barOf(lesson, beat)
      return bar > 0 ? String(bar) : ''
    },
    [lesson],
  )
  const view = useCallback((): RollView => {
    const now = performance.now()
    let v = rawView()
    const sc = scrubRef.current
    const labels = sc ? 1 : Math.min(1, Math.max(0, (labelsUntilRef.current - now) / 400))
    if (sc) {
      v = { ...v, beat: sc.beat, expected: new Set(), struck: new Set(), flashes: [], tags: [], overholds: [], countIn: null, hint: false }
    } else if (settleRef.current) {
      const st = settleRef.current
      const k = Math.min(1, (now - st.t0) / SETTLE_MS)
      if (k >= 1) settleRef.current = null
      else v = { ...v, beat: st.from + (v.beat - st.from) * (1 - (1 - k) ** 3) }
    }
    if (labels > 0) v = { ...v, barLabels: { alpha: labels, label: barLabel } }
    shownBeatRef.current = v.beat
    // Debug: welche Tasten jetzt leuchten (wie in der Pianorolle) und wann das Bild kam
    const at = v.stepStart ?? v.beat
    const sound = (n: { start: number; dur: number }) =>
      v.stepStart !== undefined ? Math.abs(n.start - at) < 1e-6 : n.start <= at + 1e-6 && at < n.start + n.dur - 1e-6
    litRef.current =
      v.hint === false ? new Set() : new Set([...v.expected].filter((m) => v.notes.some((n) => n.midi === m && sound(n))))
    debugRing.frame(now)
    return v
  }, [rawView, barLabel])

  /** Erster und letzter Taktanfang, auf den man spulen kann */
  /** Spulen geht vom ersten bis zum letzten Ton; darüber hinaus federt die Bahn (Gummiband) */
  const scrubLo = Math.min(0, ...stageNotes.map((n) => n.start))
  const scrubHi = Math.max(0, ...stageNotes.map((n) => n.start))

  /**
   * Zur Stelle `beat`, dort, wo man losgelassen hat (nichts rastet ein): Warten setzt am ersten
   * Ton an oder nach ihr an, Mitspielen steht am nächsten ganzen Schlag angehalten.
   */
  const seekTo = (beat: number) => {
    setResult(null)
    const ts = tempoRef.current
    if (ts) {
      cancelClicks()
      const first = Math.min(...ts.notes.map((n) => n.start))
      // Zurück an den Anfang: ein frischer Durchgang, der wieder zählt
      if (beat <= first + 1e-6) tempoRef.current = wired(new TempoSession(lesson, ts.stage, ts.tempo, (r) => onPassRef.current(r)))
      else {
        ts.seek(beat)
        pauseReasonRef.current = 'seek'
      }
    } else {
      const s = sessionRef.current
      if (!s) return
      s.seek(beat)
      // Die Bahn bleibt, wo man losgelassen hat, und gleitet von dort im Takt des Stücks vorwärts
      // zum Ton, an dem es weitergeht (wie beim normalen Spielen), nie zurück
      beatRef.current = Math.min(beat, s.beat)
    }
  }

  /** Über den Rand gezogen: nur ein Teil der Bewegung, mit wachsendem Widerstand (wie iOS) */
  const rubber = (raw: number) => {
    const band = (x: number) => RUBBER_BEATS * (1 - 1 / ((x * 0.55) / RUBBER_BEATS + 1))
    return raw < scrubLo ? scrubLo - band(scrubLo - raw) : raw > scrubHi ? scrubHi + band(raw - scrubHi) : raw
  }

  const onScrub = (phase: 'start' | 'move' | 'end', beats: number): boolean => {
    if (phase === 'start') {
      if (demoRef.current) stopDemo()
      if (tempoRef.current?.running) pauseTempo('seek')
      settleRef.current = null
      scrubRef.current = { from: shownBeatRef.current, beat: shownBeatRef.current }
      force((x) => x + 1)
      return false
    }
    const sc = scrubRef.current
    if (!sc) return false
    // Zum Vergleich in der Debug-Ebene: das Spulen bis zum 19.11.2026 (rastet auf den Takt)
    if (variantRef.current.scrub === 'bar') {
      const lastBar = Math.floor(scrubHi / lesson.beatsPerBar) * lesson.beatsPerBar
      sc.beat = Math.min(lastBar, Math.max(-lesson.beatsPerBar, sc.from + beats))
      if (phase === 'move') return false
      scrubRef.current = null
      seekTo(Math.min(lastBar, Math.max(0, Math.round(sc.beat / lesson.beatsPerBar) * lesson.beatsPerBar)))
      if (sessionRef.current) beatRef.current = sessionRef.current.beat
      settleRef.current = { from: sc.beat, t0: performance.now() }
      labelsUntilRef.current = performance.now() + BAR_LABELS_MS
      force((x) => x + 1)
      return false
    }
    const raw = sc.from + beats
    sc.beat = rubber(raw)
    if (phase === 'move') return raw < scrubLo || raw > scrubHi
    scrubRef.current = null
    const target = Math.min(scrubHi, Math.max(scrubLo, sc.beat))
    seekTo(target)
    // Weich zurück nur, wo die Bahn über den Rand gezogen war (Mitspielen: zum nächsten Schlag)
    const shown = tempoRef.current ? tempoRef.current.beatAt(performance.now()) : beatRef.current
    if (Math.abs(shown - sc.beat) > 1e-3) settleRef.current = { from: sc.beat, t0: performance.now() }
    labelsUntilRef.current = performance.now() + BAR_LABELS_MS
    force((x) => x + 1)
    return false
  }

  /** Nochmal wie zuletzt: die geübte Stelle bzw. das ganze Stück */
  const again = () => {
    if (tempoRef.current) return startTempo()
    sessionRef.current?.again()
    setResult(null)
    force((x) => x + 1)
  }
  /** Von vorn, auch nach einer geübten Stelle */
  const fromStart = () => {
    if (tempoRef.current) return startTempo(true)
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
    else fromStart()
  }
  /** Tipp in Bahn oder Notenband: Vorspielen endet, Mitspielen hält an bzw. setzt fort */
  const onLaneTap = () => {
    if (demoRef.current) return stopDemo()
    const cur = tempoRef.current
    if (!cur) return
    if (cur.running) pauseTempo('tap')
    // Doppeltipp hält an und läuft nicht gleich wieder los: Fortsetzen erst nach kurzer Sperre
    else if (cur.paused && performance.now() - pausedAtRef.current > RESUME_LOCK_MS) resumeTempo()
  }
  /**
   * Tipp irgendwo auf der Seite (außer Klaviatur und Knöpfen, die das selbst regeln): Während es
   * läuft, hält jeder Tipp an, auch dort, wo die ausgeblendeten Leisten waren. Sonst zählt nur
   * die Übe-Fläche (Bahn, Notenband).
   */
  const onSurface = (e: React.PointerEvent) => {
    const el = e.target as Element
    if (el.closest('.roll, button, a, [role="button"], input, .result, .bench')) return
    if (tempoRef.current?.running || el.closest('.stage-area')) onLaneTap()
  }
  const phase: SessionPhase = demo
    ? 'demo'
    : result
      ? 'result'
      : ts
        ? ts.paused
          ? 'paused'
          : running
            ? 'running'
            : 'ready'
        : s?.holding
          ? 'holding'
          : s?.started
            ? 'playing'
            : 'waiting'
  phaseRef.current = phase
  useEffect(() => debugRing.mark('phase', phase), [phase])
  const stepInfo = (): StepInfo | null => {
    const cur = sessionRef.current
    if (!cur) return null
    return { index: cur.index, total: cur.steps.length, expected: [...cur.expected] }
  }
  const reportContext = () => ({
    lessonId: lesson.id,
    stage,
    tempo: String(tempo),
    view: mode,
    keyHelp,
    phase,
    variant: { ...getVariant() },
    variantName: variantName(getVariant()),
    blind: isBlind(),
    inputs: { midi: midi.state === 'on' ? midi.devices : [], mic: micStatus },
  })
  const noInput = micStatus === 'off' && midi.state === 'off'
  const join = (...parts: (string | false)[]) => parts.filter(Boolean).join(' ') || null
  /** Takt, ab dem gerade eine Stelle geübt wird (0: von vorn) */
  const fromBar = ts?.partial ? barOf(lesson, ts.fromNote) : s?.partial ? barOf(lesson, s.fromBeat) : 0
  const laneHint = result
    ? null
    : ts?.paused
      ? pauseReasonRef.current === 'midi'
        ? t.tempo.pausedMidi
        : fromBar && pauseReasonRef.current === 'seek'
          ? t.tempo.pausedAt(fromBar)
          : t.tempo.paused
      : !ts && midiLost && midi.state === 'on'
        ? t.practice.midiLost
        : !ts && fromBar && !s?.started
        ? t.practice.fromBar(fromBar)
        : running || demo
          ? null
          : ts
            ? join(!hinted.play && t.tempo.hintPlay, noInput && t.tempo.hintNoInput, cramped && t.practice.rotateForKeys)
            : !played
              ? join(!hinted.wait && t.tempo.hintWait, noInput && t.tempo.hintNoInput, cramped && t.practice.rotateForKeys)
              : null

  return (
    <div className={`practice ${paper ? 'paper' : ''}${running ? ' hush' : ''}`} onPointerDown={onSurface}>
      <AppBar
        left={
          <button className="icon-button" onClick={onBack} aria-label={t.practice.back}>
            <BackIcon />
          </button>
        }
        title={
          <span className="title-stack">
            <span className="appbar-text" onClick={onTitleTap}>
              {localized(lesson.title)}
            </span>
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
              versions={versions}
            />
          </span>
        }
        right={
          <SettingsMenu
            mode={mode}
            onMode={setMode}
            keyHelp={keyHelp}
            onKeyHelp={setKeyHelp}
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
            onCalibrate={onCalibrate}
            diagnostics={diagnostics}
            onDiagnostics={upload ? setDiagnostics : undefined}
          />
        }
      />

      <sessionParts.Root
        className="stage-area"
        aria-label={t.practice.session}
        phase={phase}
        stage={stage}
        tempo={String(tempo)}
        pausedBy={ts?.paused ? pauseReasonRef.current : ''}
        onPause={() => pauseTempo('tap')}
        onResume={resumeTempo}
        onRestart={fromStart}
        fromBar={String(fromBar)}
        onStopDemo={stopDemo}
      >
        {/* Feste Plätze wie ein kleiner Modulkatalog: Notenband oben, Klaviatur unten, beide
            immer gleich groß; nur die Bahn dazwischen nimmt den Rest. */}
        <div
          className={`stage-grid${hasBand ? ' has-band' : ''}${sheet ? ' sheet-only' : ''}`}
          style={{ '--keys-h': `${keysH}px` } as React.CSSProperties}
        >
          {hasBand && (
            <div className="stage-band">
              <Suspense fallback={<div className="sheet-view" />}>
                {/* „Noten“: das Blatt hat die ganze Höhe über der Klaviatur, schmal in Zeilen */}
                <SheetView
                  lesson={lesson}
                  stage={stage}
                  view={view}
                  showNames={showNames}
                  showFingers={showFingers}
                  forceBand={!sheet}
                />
              </Suspense>
            </div>
          )}
          <div className="stage-roll">
            <PianoRoll
              view={view}
              beatsPerBar={lesson.beatsPerBar}
              onKey={onKey}
              onLaneTap={onLaneTap}
              onScrub={onScrub}
              expected={[...(tempoRef.current ? [] : (sessionRef.current?.expected ?? []))]}
              paper={paper}
            />
          </div>
        </div>
        {laneHint && (
          <p className={`lane-hint${sheet ? ' lane-hint-sheet' : hasBand ? ' lane-hint-band' : ''}`} style={{ '--keys-h': `${keysH}px` } as React.CSSProperties}>
            {laneHint}
          </p>
        )}
        {debug && (
          <Suspense fallback={null}>
            <DebugLayer
              ring={debugRing}
              phase={phase}
              step={stepInfo}
              context={reportContext}
              upload={upload}
              reportRef={reportRef}
              onOff={() => setDebug(false)}
            />
          </Suspense>
        )}
        {demo && (
          <button type="button" className="demo-stop" onClick={stopDemo}>
            {t.practice.demoStop}
          </button>
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
            onFromStart={fromStart}
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
      </sessionParts.Root>

      <TempoBar tempo={tempo} onTempo={(v) => setTempo(v)} cleanTempos={cleanTempos(stage)} state={barState} onPlay={onPlay} />
    </div>
  )
}

/** Wären die Tasten bei dieser Fensterbreite zu schmal? Folgt dem Drehen des Geräts */
function useCramped(notes: Parameters<typeof crampedKeys>[0]) {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1024 : window.innerWidth))
  useEffect(() => {
    const on = () => setW(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return useMemo(() => crampedKeys(notes, w), [notes, w])
}

/** Höhe der Klaviatur samt Filzstreifen; folgt der Fensterhöhe wie keyboardHeight() */
function useKeysHeight() {
  const [h, setH] = useState(() => keyboardHeight() + 6)
  useEffect(() => {
    const on = () => setH(keyboardHeight() + 6)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return h
}
