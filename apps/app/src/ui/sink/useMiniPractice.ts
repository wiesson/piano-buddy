import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { notesForStage, type Lesson, type Stage } from '@piano/core/music/lessons'
import { WaitSession, type PassResult } from '@piano/core/practice/session'
import { TempoSession, type Tempo, type TempoResult } from '@piano/core/practice/tempo'
import { audioContext, click, holdNote, playNote, stopAll } from '@piano/core/audio/audio'
import type { NoteOff, NoteOn } from '@piano/core/input/events'
import type { RollView } from '../practice/PianoRoll'
import type { SessionPhase } from '../practice/practiceSession'

/**
 * Eine kleine Übe-Sitzung für die Bausteine-Seite: dieselben Sitzungen aus @piano/core
 * (Warten, Mitspielen) und dieselben Spielregeln wie die Übe-Seite (Taste startet und setzt fort,
 * Tipp in die Bahn hält an, Taste beendet das Vorspielen), aber ohne Mikrofon, Protokoll und Sync.
 * Nichts davon landet im Fortschritt.
 */
export function useMiniPractice(lesson: Lesson, stage: Stage) {
  const [tempo, setTempo] = useState<Tempo>('wait')
  const [result, setResult] = useState<PassResult | TempoResult | null>(null)
  const [demo, setDemo] = useState(false)
  const [, force] = useState(0)
  const waitRef = useRef<WaitSession | null>(null)
  const tempoRef = useRef<TempoSession | null>(null)
  const beatRef = useRef(0)
  const lastFrameRef = useRef(0)
  const pressRef = useRef(new Map<number, number>())
  const finishedAtRef = useRef(0)
  const demoRef = useRef<{ t0: number; bpm: number } | null>(null)
  const pausedByRef = useRef('')
  const clicksRef = useRef<(() => void)[]>([])
  const notes = useMemo(() => notesForStage(lesson, stage), [lesson, stage])
  const lastBeat = useMemo(() => Math.max(...notes.map((n) => n.start + n.dur)), [notes])

  const onPass = useCallback((r: PassResult | TempoResult) => {
    finishedAtRef.current = performance.now()
    setResult(r)
  }, [])

  const cancelClicks = () => {
    clicksRef.current.forEach((c) => c())
    clicksRef.current = []
  }

  useEffect(() => {
    cancelClicks()
    if (tempo === 'wait') {
      const s = new WaitSession(lesson, stage, onPass)
      s.restart()
      waitRef.current = s
      tempoRef.current = null
      beatRef.current = s.beat
    } else {
      waitRef.current = null
      tempoRef.current = new TempoSession(lesson, stage, tempo, onPass)
    }
    setResult(null)
    force((x) => x + 1)
  }, [lesson, stage, tempo, onPass])
  useEffect(() => () => cancelClicks(), [])

  const stopDemo = useCallback(() => {
    if (!demoRef.current) return
    stopAll()
    demoRef.current = null
    setDemo(false)
  }, [])

  const countIn = (s: TempoSession) => {
    for (const k of s.countInClicks()) clicksRef.current.push(click(s.timeOf(k), k % lesson.beatsPerBar === 0))
  }
  const start = () => {
    const prev = tempoRef.current
    if (!prev) return
    stopDemo()
    cancelClicks()
    audioContext()
    const s = new TempoSession(lesson, prev.stage, prev.tempo, onPass)
    s.start(performance.now())
    countIn(s)
    tempoRef.current = s
    setResult(null)
    force((x) => x + 1)
  }
  const pause = (reason = 'tap') => {
    const s = tempoRef.current
    if (!s?.running) return
    s.pause(performance.now())
    pausedByRef.current = reason
    cancelClicks()
    force((x) => x + 1)
  }
  const resume = () => {
    const s = tempoRef.current
    if (!s?.paused) return
    stopDemo()
    s.resume(performance.now())
    countIn(s)
    pausedByRef.current = ''
    force((x) => x + 1)
  }
  const again = () => {
    if (tempoRef.current) return start()
    waitRef.current?.restart()
    setResult(null)
    force((x) => x + 1)
  }

  const input = (e: NoteOn) => {
    pressRef.current.set(e.midi, performance.now())
    if (demoRef.current) return stopDemo()
    const ts = tempoRef.current
    if (ts) {
      if (!ts.started || ts.finished || ts.paused) {
        if (ts.finished && performance.now() - finishedAtRef.current < 1200) return
        if (ts.paused) resume()
        else start()
        return
      }
      ts.input(e)
      return
    }
    const s = waitRef.current
    if (!s) return
    if (s.finished) {
      if (performance.now() - finishedAtRef.current < 1200) return
      s.restart()
      setResult(null)
    }
    s.input(e)
    force((x) => x + 1)
  }
  const release = (e: NoteOff) => {
    if (tempoRef.current) return tempoRef.current.release(e)
    waitRef.current?.release(e)
  }

  /** Bildschirmtaste: werten, klingen, beim Loslassen Haltedauer */
  const onKey = (m: number) => {
    audioContext()
    input({ midi: m, tMs: performance.now(), source: 'touch' })
    const stopSound = holdNote(m)
    return () => {
      stopSound()
      release({ midi: m, tMs: performance.now(), source: 'touch' })
    }
  }

  const onLaneTap = () => {
    if (demoRef.current) return stopDemo()
    const s = tempoRef.current
    if (s?.running) pause('tap')
    else if (s?.paused) resume()
  }

  const toggleDemo = () => {
    if (demoRef.current) return stopDemo()
    pause('demo')
    const ctx = audioContext()
    const bpm = lesson.bpm * (tempo === 'wait' ? 1 : tempo)
    const spb = 60 / bpm
    const t0 = ctx.currentTime + 0.5
    for (const n of notes) playNote(n.midi, n.dur * spb * 0.95, t0 + n.start * spb, n.hand === 'L' ? 62 : 78)
    demoRef.current = { t0, bpm }
    setDemo(true)
  }

  const view = (): RollView => {
    const now = performance.now()
    const base = { rangeNotes: lesson.notes, heard: [], showNames: true, showFingers: true }
    const pressOf = (m: number) => {
      const at = pressRef.current.get(m)
      if (at === undefined) return 0
      const age = now - at
      return age < 300 ? 1 - (age / 300) ** 2 : 0
    }
    const d = demoRef.current
    if (d) {
      const beat = ((audioContext().currentTime - d.t0) * d.bpm) / 60
      if (beat > lastBeat + 1) queueMicrotask(stopDemo)
      const expected = new Set(notes.filter((n) => beat >= n.start && beat < n.start + n.dur).map((n) => n.midi))
      beatRef.current = beat
      return { ...base, notes, beat, expected, struck: new Set(), flashes: [], press: (m) => (expected.has(m) ? 1 : 0), hint: true }
    }
    const ts = tempoRef.current
    if (ts) {
      const wasRunning = ts.running
      ts.tick(now)
      if (wasRunning !== ts.running) queueMicrotask(() => force((x) => x + 1))
      const beat = ts.beatAt(now)
      const sounding = ts.started ? ts.soundingAt(beat) : ts.notes.filter((n) => n.start === ts.notes[0]?.start)
      return {
        ...base,
        notes: ts.notes,
        beat,
        expected: new Set(sounding.map((n) => n.midi)),
        struck: new Set(sounding.filter((n) => n.onMs !== null && n.offMs === null).map((n) => n.midi)),
        flashes: ts.feedback
          .filter((f) => f.kind === 'hit' || f.kind === 'wrong')
          .map((f) => ({ midi: f.midi, kind: f.kind as 'hit' | 'wrong', age: now - f.tMs })),
        judge: (n) => ({ missed: (n as (typeof ts.notes)[number]).state === 'missed' }),
        countIn: ts.countInShown(now),
        press: pressOf,
        hint: true,
      }
    }
    const s = waitRef.current
    const holdingBefore = !!s?.holding
    s?.tick(now)
    if (s && !!s.holding !== holdingBefore) queueMicrotask(() => force((x) => x + 1))
    const hold = s?.holdProgress(now)
    // Beim Halten läuft die Bahn genau bis zum Ende des Tons: Ist das Halten geschafft, steht der
    // nächste Ton an der Linie, ohne Rest und ohne Stopp
    const holdBeats = s?.holding ? s.holding.beats : 0
    const target = s?.finished ? (s.steps[s.steps.length - 1]?.start ?? 0) + 2 : (s?.beat ?? 0) + (hold ?? 0) * holdBeats
    // Im Takt des Stücks nach unten, wie auf der Übe-Seite
    const dt = Math.min(100, now - (lastFrameRef.current || now))
    lastFrameRef.current = now
    const dist = target - beatRef.current
    if (dist < 0) beatRef.current += dist * 0.25
    else beatRef.current = Math.min(target, beatRef.current + (lesson.bpm / 60_000) * Math.max(1, dist) * dt)
    if (Math.abs(target - beatRef.current) < 0.002) beatRef.current = target
    const arrived = Math.abs(beatRef.current - (s?.beat ?? 0)) < 0.4 || !!s?.holding
    return {
      ...base,
      notes,
      // Nie einrasten: Ein Sprung auf den Zielschlag wäre der Ruck kurz vor jedem Ton
      beat: beatRef.current,
      expected: arrived ? (s?.expected ?? new Set()) : new Set(),
      struck: s?.struck ?? new Set(),
      flashes: (s?.feedback ?? [])
        .filter((f) => f.kind !== 'short')
        .map((f) => ({ midi: f.midi, kind: f.kind as 'hit' | 'wrong', age: now - f.tMs })),
      press: pressOf,
      hint: true,
    }
  }

  const ts = tempoRef.current
  const s = waitRef.current
  const phase: SessionPhase = demo
    ? 'demo'
    : result
      ? 'result'
      : ts
        ? ts.paused
          ? 'paused'
          : ts.running
            ? 'running'
            : 'ready'
        : s?.holding
          ? 'holding'
          : s?.started
            ? 'playing'
            : 'waiting'
  const barState: 'idle' | 'running' | 'paused' | 'restart' | 'waiting' = ts
    ? ts.paused
      ? 'paused'
      : ts.running
        ? 'running'
        : 'idle'
    : s && (s.index > 0 || result)
      ? 'restart'
      : 'waiting'
  const onPlay = () => (barState === 'running' ? pause('tap') : barState === 'paused' ? resume() : again())

  return {
    tempo,
    setTempo: (v: Tempo) => {
      stopDemo()
      setTempo(v)
    },
    result,
    demo,
    phase,
    pausedBy: ts?.paused ? pausedByRef.current : '',
    barState,
    view,
    onKey,
    onLaneTap,
    onPlay,
    again,
    pause: () => pause('tap'),
    resume,
    toggleDemo,
    stopDemo,
    /** Schritte des Warte-Modus (für den Agenten): Töne und Länge in Schlägen */
    steps: () => {
      const st = waitRef.current?.steps ?? []
      return st.map((x, i) => ({ midis: x.notes.map((n) => n.midi), beats: (st[i + 1]?.start ?? x.start + Math.max(...x.notes.map((n) => n.dur))) - x.start }))
    },
    expected: [...(tempoRef.current ? [] : (waitRef.current?.expected ?? []))],
  }
}
