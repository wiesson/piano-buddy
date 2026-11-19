import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { Toggle } from '@ui-sdk/react/toggle'
import { OTPInput, OTPInputGroup, OTPInputSeparator, OTPInputSlot } from '@ui-sdk/react/otp-input'
import { createParts } from '@ui-sdk/react/primitive'
import { LESSONS, stagesFor, type Stage } from '@piano/core/music/lessons'
import type { PassResult } from '@piano/core/practice/session'
import type { Tempo } from '@piano/core/practice/tempo'
import { dayKey } from '@piano/core/practice/plan'
import { audioContext, getPiano } from '@piano/core/audio/audio'
import type { MicStatus } from '@piano/core/audio/mic'
import { displayNoteLabel } from '@piano/core/i18n/noteNames'
import { t, localized } from '@piano/core/i18n'
import { Logo, MicIcon, MidiIcon } from '@piano/ui/shared/icons'
import { toast } from '@piano/ui/shared/Toaster'
import { useThemeColor } from '@piano/ui/shared/useThemeColor'
import { PianoRoll } from '../practice/PianoRoll'
import { TempoBar } from '../practice/TempoBar'
import { ResultCard } from '../practice/ResultCard'
import { StageMenu } from '../practice/StageMenu'
import { SettingsMenu } from '../practice/SettingsMenu'
import { MicMeter } from '../practice/MicMeter'
import { practiceSession, type SessionPhase } from '../practice/practiceSession'
import type { MidiState } from '../practice/useMidiInput'
import { useMiniPractice } from './useMiniPractice'
import { sinkAgent, type Agent } from './sinkAgent'
// Eigenes CSS nur mit dieser Seite laden (Route wird nachgeladen), nicht in der Übe-App
import '../../styles/sink.css'

const SheetView = lazy(() => import('../practice/SheetView'))
const sessionParts = createParts(practiceSession, { root: 'div' })
const LESSON = LESSONS.find((l) => l.id === 'entchen') ?? LESSONS[0]
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Beispielwerte für Stufen und Ergebnis, bis man selbst gespielt hat (nichts kommt aus dem Fortschritt) */
const SAMPLE_CLEAN: Record<Stage, number> = { L: 3, R: 2, LR: 0 }
const SAMPLE_BEST = { L: { percent: 100, stars: 3 }, R: { percent: 92, stars: 2 }, LR: null } as const
const SAMPLE_TEMPOS: Record<Stage, Tempo[]> = { L: ['wait', 0.6], R: ['wait'], LR: [] }
const SAMPLE_RESULT: PassResult = {
  clean: false,
  wrong: 1,
  durationMs: 24_000,
  unverified: 0,
  short: 0,
  source: 'midi',
  percent: 92,
  missedBars: [3],
}

type LogLine = { id: number; who: 'agent' | 'you'; text: string }

/**
 * Bausteine-Seite (/sink): ein Raster aus Karten wie ein Katalog, jede Karte die echte Komponente
 * der App und bedienbar, darunter ein Satz und die UI-SDK-Bausteine dahinter. Herzstück: eine
 * kleine Übe-Fläche, die ein Agent über act() spielt, und die Zustände, die er im Snapshot liest.
 * Nicht verlinkt; gedacht zum Zeigen.
 */
export function SinkPage() {
  useThemeColor('#f6eedf')
  const [stage, setStage] = useState<Stage>('R')
  const mini = useMiniPractice(LESSON, stage)
  const stageRef = useRef(stage)
  stageRef.current = stage
  const miniRef = useRef(mini)
  miniRef.current = mini
  const stages = stagesFor(LESSON)

  // Brücke, Protokoll, Snapshot
  const agentRef = useRef<Agent | null>(null)
  const [log, setLog] = useState<LogLine[]>([])
  const logId = useRef(0)
  const push = (who: LogLine['who'], text: string) =>
    setLog((l) => [{ id: ++logId.current, who, text }, ...l].slice(0, 6))
  const [snap, setSnap] = useState<Record<string, unknown> | null>(null)
  useEffect(() => {
    let alive = true
    let off = () => {}
    void sinkAgent().then((a) => {
      if (!alive) return
      agentRef.current = a
      off = a.subscribe((c) => {
        if (c.component === 'practice-session') return
        push(c.source === 'agent' ? 'agent' : 'you', `${c.label ?? c.component} · ${c.key} → ${String(c.value)} · ${c.reason ?? ''}`)
      })
    })
    const timer = window.setInterval(() => {
      const s = agentRef.current?.snapshot().find((c) => c.component === 'practice-session')
      if (s) {
        const { component, phase, stage, tempo, pausedBy, actions } = s as Record<string, unknown>
        setSnap({ component, phase, stage, tempo, pausedBy, actions })
      }
    }, 250)
    getPiano()
    return () => {
      alive = false
      off()
      clearInterval(timer)
    }
  }, [])

  // Der Agent spielt: dieselbe Klaviatur, Taste für Taste über act()
  const acting = useRef(false)
  const runRef = useRef(false)
  const [agentOn, setAgentOn] = useState(false)
  const runAgent = async () => {
    if (runRef.current) {
      runRef.current = false
      return
    }
    const a = agentRef.current
    if (!a) return
    audioContext()
    runRef.current = true
    setAgentOn(true)
    try {
      const act = async (steps: { ref: string; action: string; args?: unknown[] }[]) => {
        acting.current = true
        try {
          return await a.act({ steps })
        } finally {
          acting.current = false
        }
      }
      if (miniRef.current.tempo !== 'wait') {
        await act([{ ref: t.tempo.label, action: 'setValue', args: ['wait'] }])
        await sleep(350)
      }
      const spb = 60_000 / LESSON.bpm
      // Von vorn in der aktuellen Stufe; wechselt jemand die Stufe, während der Agent spielt,
      // fängt er dort neu an (sonst spielte er die Töne der alten Hand in die neue)
      let playing: Stage | null = null
      let steps: ReturnType<typeof miniRef.current.steps> = []
      let i = 0
      while (runRef.current) {
        if (playing !== stageRef.current) {
          await sleep(playing ? 350 : 0) // neue Sitzung abwarten
          const snapNow = a.snapshot()
          const session = snapNow.find((c) => c.component === 'practice-session')
          if (!session) return
          await act([{ ref: session.ref, action: 'restart' }])
          push('agent', `act · restart (${t.stage[stageRef.current]}) → ${t.sink.phases.waiting}`)
          await sleep(400)
          playing = stageRef.current
          steps = miniRef.current.steps()
          i = 0
        }
        const step = steps[i++]
        if (!step) break
        const keys = a.snapshot().find((c) => c.component === 'piano-keys')
        if (!keys) return
        const r = await act(step.midis.map((m) => ({ ref: keys.ref, action: 'play', args: [m] })))
        await sleep(30)
        push('agent', `act · play(${step.midis.map(displayNoteLabel).join(' ')}) → ${t.sink.phases[miniRef.current.phase]}${r.ok ? '' : ' ✕'}`)
        await sleep(Math.min(1500, Math.max(280, step.beats * spb)))
      }
    } finally {
      runRef.current = false
      setAgentOn(false)
    }
  }
  useEffect(() => () => void (runRef.current = false), [])

  const onKey = (m: number) => {
    if (!acting.current) push('you', `play(${displayNoteLabel(m)}) → ${t.sink.phases[miniRef.current.phase]}`)
    return mini.onKey(m)
  }

  // Eingang (nur Anzeige): MIDI, Klavier da, Mikrofon mit Pegel
  const [midiOn, setMidiOn] = useState(true)
  const [piano, setPiano] = useState(true)
  const [micOn, setMicOn] = useState(false)
  const levelRef = useRef(0)
  useEffect(() => {
    if (!micOn) return void (levelRef.current = 0)
    let raf = 0
    const loop = (now: number) => {
      levelRef.current = 0.35 + 0.3 * Math.abs(Math.sin(now / 260)) * Math.abs(Math.cos(now / 710))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [micOn])
  const midi: MidiState = { state: midiOn ? 'on' : 'off', devices: midiOn && piano ? ['CA701 MIDI'] : [] }
  const micStatus: MicStatus = micOn ? 'listening' : 'off'
  const [names, setNames] = useState(true)
  const [fingers, setFingers] = useState(true)
  const [metronome, setMetronome] = useState(true)
  const [fingerKeys, setFingerKeys] = useState(true)

  // Koppeln
  const [code, setCode] = useState('')

  const playMode = mini.tempo !== 'wait'
  const nextStage = stages[stages.indexOf(stage) + 1]

  return (
    <div className="sink paper">
      <header className="sink-head">
        <span className="sink-brand">
          <Logo size={26} />
          <span>{t.appName}</span>
          <span className="sink-slash">/</span>
          <span className="sink-title">{t.sink.title}</span>
        </span>
        <p className="sink-lede">{t.sink.lede}</p>
      </header>

      <main className="sink-grid">
        <Card
          className="sink-hero sink-dark"
          title={t.sink.agentTitle}
          body={t.sink.agentBody}
          tags={['createAgent', 'act', 'subscribe', 'definePrimitive', 'createRovingFocus', 'SegmentedControl']}
        >
          <sessionParts.Root
            className="sink-stage"
            aria-label={t.practice.session}
            phase={mini.phase}
            stage={stage}
            tempo={String(mini.tempo)}
            pausedBy={mini.pausedBy}
            onPause={mini.pause}
            onResume={mini.resume}
            onRestart={mini.again}
            onStopDemo={mini.stopDemo}
          >
            <PianoRoll
              view={mini.view}
              beatsPerBar={LESSON.beatsPerBar}
              onKey={onKey}
              onLaneTap={mini.onLaneTap}
              expected={mini.expected}
            />
          </sessionParts.Root>
          <TempoBar
            tempo={mini.tempo}
            onTempo={mini.setTempo}
            cleanTempos={new Set(SAMPLE_TEMPOS[stage])}
            state={mini.barState}
            onPlay={mini.onPlay}
          />
          <div className="sink-agent">
            <button type="button" className={`sink-agent-btn${agentOn ? ' on' : ''}`} onClick={() => void runAgent()}>
              <span className="sink-agent-dot" aria-hidden="true" />
              {agentOn ? t.sink.agentStop : t.sink.agentPlay}
            </button>
            <ol className="sink-log" aria-live="polite">
              {log.length === 0 && <li className="sink-log-empty">{t.sink.logEmpty}</li>}
              {log.map((l) => (
                <li key={l.id} className={`sink-log-${l.who}`}>
                  <span className="sink-who">{l.who === 'agent' ? t.sink.agent : t.sink.you}</span>
                  <span className="sink-what">{l.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </Card>

        <Card
          className="sink-states"
          title={t.sink.statesTitle}
          body={t.sink.statesBody}
          tags={['practice-session', 'definePrimitive', 'controlled', 'snapshot']}
        >
          <StateDiagram phase={mini.phase} playMode={playMode} />
          <pre className="sink-json" aria-label={t.sink.snapshot}>
            <span className="sink-json-label">{t.sink.snapshot}</span>
            {snap ? JSON.stringify(snap, null, 1).replace(/\n\s*/g, ' ') : '…'}
          </pre>
        </Card>

        <Card className="sink-result-card" title={t.sink.resultTitle} body={t.sink.resultBody} tags={['role=status', 'announce', 'Toast']}>
          <div className="sink-result">
            <ResultCard
              result={mini.result ?? SAMPLE_RESULT}
              stage={stage}
              nextStage={nextStage}
              clean={SAMPLE_CLEAN[stage]}
              onAgain={mini.again}
              onFromStart={mini.again}
              onNext={setStage}
              onTempo={(v) => mini.setTempo(v)}
              tempo={mini.tempo}
              cleanTempos={new Set(SAMPLE_TEMPOS[stage])}
              best={SAMPLE_BEST[stage]}
              praise={null}
            />
          </div>
        </Card>

        <Card className="sink-input" title={t.sink.inputTitle} body={t.sink.inputBody} tags={['Toggle', 'onPressedChange', 'Popover', 'Drawer']}>
          <div className="sink-mockbar">
            <span className="sink-mockbar-title">{localized(LESSON.title)}</span>
            <SettingsMenu
              mode="roll"
              onMode={() => {}}
              midi={midi}
              onToggleMidi={() => setMidiOn((v) => !v)}
              micStatus={micStatus}
              levelRef={levelRef}
              onToggleMic={() => setMicOn((v) => !v)}
              metronome={metronome}
              onMetronome={setMetronome}
              showNames={names}
              onShowNames={setNames}
              showFingers={fingers}
              onShowFingers={setFingers}
              fingerKeys={fingerKeys}
              onFingerKeys={setFingerKeys}
              diagnostics={false}
            />
          </div>
          <div className="sink-rows">
            <Toggle className="sink-toggle" pressed={midiOn} onPressedChange={setMidiOn}>
              <span className="sink-toggle-name">
                <MidiIcon lost={midiOn && !piano} />
                MIDI
              </span>
            </Toggle>
            <Toggle className="sink-toggle" pressed={piano} onPressedChange={setPiano} disabled={!midiOn}>
              <span className="sink-toggle-name">{t.sink.piano}</span>
            </Toggle>
            <Toggle className="sink-toggle" pressed={micOn} onPressedChange={setMicOn}>
              <span className="sink-toggle-name">
                {micOn ? <MicMeter levelRef={levelRef} active /> : <MicIcon />}
                {t.practice.mic.off}
              </span>
            </Toggle>
          </div>
        </Card>

        <Card className="sink-notes" title={t.sink.notesTitle} body={t.sink.notesBody} tags={['practice-session', 'view()', 'VexFlow']}>
          <div className="sink-band">
            <Suspense fallback={<div className="sheet-view" />}>
              <SheetView lesson={LESSON} stage={stage} view={mini.view} showNames={names} showFingers={fingers} forceBand />
            </Suspense>
          </div>
        </Card>

        <Card className="sink-stages" title={t.sink.stagesTitle} body={t.sink.stagesBody} tags={['Popover', 'Drawer', "snapPoints={['content']}"]}>
          <div className="sink-chip-stage">
            <span className="sink-chip-title">{localized(LESSON.title)}</span>
            <StageMenu
              stages={stages}
              stage={stage}
              onChange={setStage}
              cleanCount={(s) => SAMPLE_CLEAN[s]}
              best={(s) => SAMPLE_BEST[s]}
              cleanTempos={(s) => new Set(SAMPLE_TEMPOS[s])}
              due={(s) => (SAMPLE_CLEAN[s] >= 3 ? dayKey(Date.now() + 2 * 86_400_000) : null)}
              goal={localized(LESSON.goal)}
              demo={mini.demo}
              onToggleDemo={mini.toggleDemo}
            />
          </div>
        </Card>

        <Card className="sink-pair" title={t.sink.pairTitle} body={t.sink.pairBody} tags={['OTPInput', 'onValueCommit', 'Toast']}>
          <div className="sink-otp">
            <OTPInput
              className="otp"
              maxLength={8}
              pattern={/[A-HJ-NP-Za-hj-np-z2-9]/}
              inputMode="text"
              value={code}
              onValueChange={(v) => setCode(v.toUpperCase())}
              onValueCommit={() => {
                toast(t.sink.pairDone, { description: t.sink.pairDemo })
                window.setTimeout(() => setCode(''), 1200)
              }}
              aria-label={t.sync.codeLabel}
            >
              <OTPInputGroup className="otp-group">
                {[0, 1, 2, 3].map((i) => (
                  <OTPInputSlot key={i} index={i} className="otp-slot" />
                ))}
              </OTPInputGroup>
              <OTPInputSeparator className="otp-sep">–</OTPInputSeparator>
              <OTPInputGroup className="otp-group">
                {[4, 5, 6, 7].map((i) => (
                  <OTPInputSlot key={i} index={i} className="otp-slot" />
                ))}
              </OTPInputGroup>
            </OTPInput>
          </div>
        </Card>
      </main>

      <footer className="sink-foot">{t.sink.credit}</footer>
    </div>
  )
}

function Card({
  className = '',
  title,
  body,
  tags,
  children,
}: {
  className?: string
  title: string
  body: string
  tags: string[]
  children: ReactNode
}) {
  return (
    <section className={`sink-card ${className}`}>
      <div className="sink-demo">{children}</div>
      <p className="sink-cap">
        <b>{title}</b> {body}
      </p>
      <ul className="sink-tags">
        {tags.map((x) => (
          <li key={x}>
            <code>{x}</code>
          </li>
        ))}
      </ul>
    </section>
  )
}

const ROWS: { mode: 'wait' | 'play'; nodes: SessionPhase[]; links: string[] }[] = [
  { mode: 'wait', nodes: ['waiting', 'playing', 'holding', 'result'], links: ['→', '⇄', '→'] },
  { mode: 'play', nodes: ['ready', 'running', 'paused', 'result'], links: ['→', '⇄', '→'] },
]

/** Die Phasen als Schienen; die aktuelle leuchtet (Ergebnis nur in der Schiene der Übungsart) */
function StateDiagram({ phase, playMode }: { phase: SessionPhase; playMode: boolean }) {
  return (
    <div className="sink-diagram">
      {ROWS.map((row) => (
        <div key={row.mode} className={`sink-rail${(row.mode === 'play') === playMode ? ' current' : ''}`}>
          <span className="sink-rail-label">{row.mode === 'wait' ? t.sink.rowWait : t.sink.rowPlay}</span>
          <div className="sink-rail-nodes">
            {row.nodes.map((n, i) => (
              <span key={n} className="sink-node-wrap">
                <span
                  className={`sink-node${n === phase && (row.mode === 'play') === playMode ? ' active' : ''}`}
                  data-phase={n}
                >
                  {t.sink.phases[n]}
                </span>
                {i < row.links.length && (
                  <span className="sink-link" aria-hidden="true">
                    {row.links[i]}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      ))}
      <div className="sink-rail current">
        <span className="sink-rail-label">{t.sink.across}</span>
        <div className="sink-rail-nodes">
          <span className={`sink-node${phase === 'demo' ? ' active' : ''}`}>{t.sink.phases.demo}</span>
        </div>
      </div>
    </div>
  )
}
