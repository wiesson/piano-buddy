import { NoteAnalyzer, OnsetDetector, calibrate, type Calibration, type Frame } from './detector'
import { TakeCollector, checkTake, type Take } from './calibrate'
import { mergeTakes, takeShape, type MicProfile, type ProfileLookup } from './profile'
import { WaitSession, type PassResult } from '../practice/session'
import type { Lesson, Stage } from '../music/lessons'

/**
 * Prüfstand ohne Mikrofon: Eine Aufnahme (PCM) läuft durch denselben Weg wie in der App
 * (MicListener): Analyse alle 20 ms mit 8192er-Fenster, 0,9 s Ruhemessung, Anschlagserkennung,
 * Warte-Modus. So lassen sich ganze Durchgänge automatisch prüfen: mit künstlich erzeugten
 * Aufführungen in Tests und mit echten Aufnahmen aus „Messung senden“ bei der Fehlersuche.
 */

const HOP_MS = 20
const CALIBRATION_MS = 900
const FFT = 8192

/** Frames wie im MicListener: Fenster endet jeweils am aktuellen Zeitpunkt */
export function framesOf(pcm: Float32Array, sampleRate: number) {
  const an = new NoteAnalyzer(sampleRate, FFT)
  const hop = Math.round((sampleRate * HOP_MS) / 1000)
  const out: { tMs: number; frame: Frame }[] = []
  for (let end = FFT; end <= pcm.length; end += hop) {
    out.push({ tMs: (end / sampleRate) * 1000, frame: an.analyze(pcm.subarray(end - FFT, end)) })
  }
  return out
}

function quietCalibration(frames: { tMs: number; frame: Frame }[]): Calibration {
  const t0 = frames[0]?.tMs ?? 0
  return calibrate(frames.filter((f) => f.tMs - t0 < CALIBRATION_MS).map((f) => f.frame))
}

export interface PracticeReplay {
  passes: PassResult[]
  /** alle als falsch gewerteten Töne mit Zeitpunkt */
  wrong: { midi: number; tMs: number }[]
  /** Schritte des Stücks und wie weit der Durchgang kam */
  steps: number
  reached: number
}

/** Einen Durchgang im Warte-Modus nachspielen */
export function replayPractice(
  pcm: Float32Array,
  sampleRate: number,
  lesson: Lesson,
  stage: Stage,
  profile: ProfileLookup | null = null,
): PracticeReplay {
  const frames = framesOf(pcm, sampleRate)
  const cal = quietCalibration(frames)
  const passes: PassResult[] = []
  const session = new WaitSession(lesson, stage, (r) => passes.push(r))
  const onset = new OnsetDetector(() => cal, undefined, undefined, undefined, undefined, () => profile)
  const wrong: PracticeReplay['wrong'] = []
  const seen = new Set<object>()
  const t0 = frames[0]?.tMs ?? 0
  for (const { tMs, frame } of frames) {
    if (tMs - t0 < CALIBRATION_MS) continue
    if (session.finished) break
    for (const m of onset.push(frame, tMs, session.expected)) session.input({ midi: m, tMs, source: 'mic' })
    session.tick(tMs)
    for (const f of session.feedback) {
      if (f.kind === 'wrong' && !seen.has(f)) {
        seen.add(f)
        wrong.push({ midi: f.midi, tMs: f.tMs })
      }
    }
  }
  return { passes, wrong, steps: session.steps.length, reached: session.index }
}

/**
 * Lernmodus nachspielen: Anschläge der Reihe nach den Zieltönen zuordnen (wie die App, ohne
 * Rückfragen), Klangprofil bilden.
 */
export function replayCalibration(pcm: Float32Array, sampleRate: number, targets: number[]): MicProfile {
  const frames = framesOf(pcm, sampleRate)
  const cal = quietCalibration(frames)
  const takes: Take[] = []
  const collector = new TakeCollector(
    () => {},
    (t) => takes.push(t),
  )
  const t0 = frames[0]?.tMs ?? 0
  for (const { tMs, frame } of frames) if (tMs - t0 >= CALIBRATION_MS) collector.push(frame, tMs)
  const byNote = new Map<number, { shape: number[]; level: number }[]>()
  takes.slice(0, targets.length).forEach((take, i) => {
    const m = targets[i]
    if (!checkTake(take, m, cal).ok) return
    const s = takeShape(take.frames, m)
    if (s) byNote.set(m, [...(byNote.get(m) ?? []), s])
  })
  const notes: MicProfile['notes'] = {}
  for (const [m, shapes] of byNote) {
    const p = mergeTakes(shapes)
    if (p) notes[m] = p
  }
  return { name: 'replay', createdAt: new Date(0).toISOString(), notes }
}
