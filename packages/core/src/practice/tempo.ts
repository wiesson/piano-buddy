import { barOf, notesForStage, type Hand, type Lesson, type ScoreNote, type Stage } from '../music/lessons'
import type { NoteOff, NoteOn } from '../input/events'
import type { Judgement, PassResult, Verdict } from './session'

/**
 * Mitspiel-Modus: Das Stück läuft im Tempo durch, nach einem Takt Einzähler. Jeder Ton wird
 * einzeln gegen die Uhr des Stücks gewertet: Anschlag (pünktlich, knapp, verpasst) und, wo die
 * Eingabe das Loslassen meldet, die Haltedauer (zu kurz, richtig, zu lang).
 *
 * Vorbilder: Flowkey und Melodics (erst warten, dann Tempo-Stufen), Rhythmusspiele für die
 * Fenster (StepMania J4: ±45/90/135 ms, osu!mania: Ende langer Noten mit breiterem Fenster und
 * gedeckelter statt voller Strafe). Für Anfänger breiter: Die Fenster wachsen mit der Länge eines
 * Schlags (Abweichungen nimmt man relativ zum Schlag wahr), mit festen Grenzen.
 */

/** Tempo-Stufen: Warten (eigenes Tempo), dann Anteil des Stück-Tempos */
export type Tempo = 'wait' | 0.6 | 0.8 | 1
export const TEMPO_LADDER: readonly Tempo[] = ['wait', 0.6, 0.8, 1]

export const isTempo = (v: unknown): v is Tempo => TEMPO_LADDER.includes(v as Tempo)
export const nextTempo = (t: Tempo): Tempo | null => TEMPO_LADDER[TEMPO_LADDER.indexOf(t) + 1] ?? null
export const slowerTempo = (t: Tempo): Tempo | null => {
  const i = TEMPO_LADDER.indexOf(t)
  return i > 0 ? TEMPO_LADDER[i - 1] : null
}

/** Länge eines Schlags in ms bei einem Anteil des Stück-Tempos */
export function beatMs(bpm: number, tempo: number): number {
  return 60000 / (bpm * tempo)
}

/** Das Mikrofon meldet einen Ton erst nach der Erkennung (Median der Messkarte etwa 110 ms) */
export const MIC_LATENCY_MS = 110
/** Mehr Fenster für das Mikrofon: Seine Erkennungszeit schwankt */
export const MIC_EXTRA_MS = 40

/** Ton gilt als zu kurz, wenn er vor diesem Anteil seiner Länge losgelassen wird */
export const SHORT_SHARE = 0.55
/** Haltefehler kosten den Ton nur diesen Anteil seines Werts (Hinweis, keine Strafe) */
export const HOLD_PENALTY = 0.15
/** Knapp getroffene Töne zählen so viel */
export const NEAR_VALUE = 0.75
/** Falsche Töne zählen als halber Ton gegen den Durchgang */
export const WRONG_WEIGHT = 0.5

export interface Windows {
  /** ±ms um den Notenbeginn: pünktlich */
  onTime: number
  /** ±ms: noch getroffen, aber knapp (früh oder spät); danach verpasst */
  near: number
  /** So lange nach dem Notenende darf ein Ton noch klingen, bevor er „zu lang“ ist */
  holdOver: number
}

/**
 * Fenster für einen Schlag dieser Länge: pünktlich ±10 % des Schlags (60 bis 110 ms), knapp
 * ±25 % (150 bis 250 ms), zu lang ab einem halben Schlag (mindestens 250 ms) über das Ende.
 */
export function windowsFor(beat: number, source?: string): Windows {
  const extra = source === 'mic' ? MIC_EXTRA_MS : 0
  return {
    onTime: clamp(0.1 * beat, 60, 110) + extra,
    near: clamp(0.25 * beat, 150, 250) + extra,
    holdOver: Math.max(0.5 * beat, 250),
  }
}

export type HoldGrade = 'ok' | 'short' | 'long'

/** Haltedauer eines Tons: losgelassen nach `heldMs`, Note dauert `noteMs` */
export function holdGrade(heldMs: number, noteMs: number, beat: number): HoldGrade {
  if (heldMs < SHORT_SHARE * noteMs) return 'short'
  if (heldMs > noteMs + windowsFor(beat).holdOver) return 'long'
  return 'ok'
}

export type NoteState = 'pending' | 'onTime' | 'near' | 'missed'

export interface JudgedNote extends ScoreNote {
  state: NoteState
  /** Abweichung des Anschlags in ms (negativ: früh) */
  deltaMs: number
  /** Anschlag und Loslassen (performance.now()), null solange nicht geschehen */
  onMs: number | null
  offMs: number | null
  hold: HoldGrade | null
  /** Eingabe des Anschlags */
  source: string | null
}

export interface TempoFeedback {
  midi: number
  kind: 'hit' | 'early' | 'late' | 'wrong' | 'short' | 'long'
  hand?: Hand
  tMs: number
}

export interface TempoResult extends PassResult {
  tempo: number
  onTime: number
  near: number
  missed: number
  long: number
  /** false, wenn die Eingabe das Loslassen nicht meldet (Mikrofon) */
  holdGraded: boolean
  /** Takt, der am deutlichsten eilt (negativ) oder schleppt (positiv), mittlere Abweichung in ms */
  drift: { bar: number; ms: number } | null
  /** Je Ton (Reihenfolge der Noten): Abweichung des Anschlags in ms, null = verpasst. Für den Geist */
  timing: (number | null)[]
  /** Je Ton: gehaltener Anteil der Notenlänge in Prozent, null = nicht gemessen (Mikrofon, Pause) */
  held: (number | null)[]
}

/** Mittlere Abweichung, ab der ein Takt als eilend oder schleppend gilt */
const DRIFT_MS = 45

/** Bewertung eines fertigen Durchgangs (ohne Uhr, damit sie sich prüfen lässt) */
export function scoreTempoPass(
  notes: Pick<JudgedNote, 'state' | 'hold' | 'start' | 'deltaMs'>[],
  wrong: number,
  holdGraded: boolean,
  lesson: Pick<Lesson, 'beatsPerBar' | 'pickup'>,
  wrongBars: number[] = [],
) {
  let score = 0
  let onTime = 0
  let near = 0
  let missed = 0
  let short = 0
  let long = 0
  const bars = new Map<number, number[]>()
  const missedBars = new Set(wrongBars)
  for (const n of notes) {
    let v = 0
    if (n.state === 'onTime') {
      v = 1
      onTime++
    } else if (n.state === 'near') {
      v = NEAR_VALUE
      near++
    } else {
      missed++
      missedBars.add(barOf(lesson, n.start))
    }
    if (holdGraded && (n.hold === 'short' || n.hold === 'long')) {
      v *= 1 - HOLD_PENALTY
      if (n.hold === 'short') short++
      else long++
    }
    score += v
    if (n.state === 'onTime' || n.state === 'near') {
      const bar = barOf(lesson, n.start)
      const list = bars.get(bar) ?? []
      list.push(n.deltaMs)
      bars.set(bar, list)
    }
  }
  const total = notes.length
  const percent = total ? Math.min(100, Math.floor((100 * score) / (total + WRONG_WEIGHT * wrong))) : 100
  const struck = onTime + near
  const clean =
    missed === 0 &&
    wrong === 0 &&
    (total === 0 || onTime / total >= 0.9) &&
    (!holdGraded || struck === 0 || (struck - short - long) / struck >= 0.8)
  let drift: { bar: number; ms: number } | null = null
  for (const [bar, ds] of bars) {
    const mean = ds.reduce((a, b) => a + b, 0) / ds.length
    if (Math.abs(mean) >= DRIFT_MS && (!drift || Math.abs(mean) > Math.abs(drift.ms))) drift = { bar, ms: Math.round(mean) }
  }
  return { percent, clean, onTime, near, missed, short, long, drift, missedBars: [...missedBars].sort((a, b) => a - b) }
}

export class TempoSession {
  readonly notes: JudgedNote[]
  readonly beat: number
  readonly win: Windows
  /** Takte des Einzählers (in Schlägen) */
  readonly countInBeats: number
  /** Zeitpunkt (performance.now()) von Schlag 0; null vor dem Start */
  t0: number | null = null
  /** Bis zu diesem Schlag läuft der Einzähler (0 beim Start, die Pausenstelle beim Fortsetzen) */
  countTo = 0
  paused = false
  private pausedBeat = 0
  finished = false
  wrong = 0
  private wrongBars: number[] = []
  feedback: TempoFeedback[] = []
  private sourceHits: Record<string, number> = {}
  private lastBeat: number
  private passStart = 0
  /** Meldet die Eingabe das Loslassen? Sobald ein Ton per Mikrofon kam, wird nicht gewertet */
  private holdGraded = true
  /** Gespult: Der Durchgang beginnt an diesem Schlag (0: von vorn). Töne davor zählen nicht */
  from = 0
  /** Wird für jeden Anschlag genau einmal mit seinem Urteil aufgerufen */
  onJudge?: (j: Judgement) => void
  /** Töne (Index in notes), deren Taste als Hilfe leuchtete, solange sie noch offen waren */
  private hintedNotes = new Set<number>()

  /** Die Anzeige meldet: Diese Töne leuchten gerade auf der Klaviatur (Hilfe sichtbar) */
  markHinted(notes: readonly JudgedNote[]) {
    if (!this.running) return
    for (const n of notes) if (n.state === 'pending' && n.start >= this.from - 1e-6) this.hintedNotes.add(this.notes.indexOf(n))
  }

  constructor(
    readonly lesson: Lesson,
    readonly stage: Stage,
    readonly tempo: number,
    private onPass: (r: TempoResult) => void,
  ) {
    this.notes = notesForStage(lesson, stage).map((n) => ({ ...n, state: 'pending', deltaMs: 0, onMs: null, offMs: null, hold: null, source: null }))
    this.beat = beatMs(lesson.bpm, tempo)
    this.win = windowsFor(this.beat)
    this.countInBeats = lesson.beatsPerBar
    this.lastBeat = Math.max(0, ...this.notes.map((n) => n.start + n.dur))
  }

  get started() {
    return this.t0 !== null
  }

  /** Einzähler beginnt jetzt; Schlag 0 fällt einen Takt später */
  start(nowMs: number, leadMs = 150) {
    this.t0 = nowMs + leadMs + this.countInBeats * this.beat
    this.countTo = 0
    this.passStart = this.t0
    this.paused = false
  }

  /** Position in Schlägen (negativ während des Einzählers) */
  beatAt(nowMs: number): number {
    if (this.t0 === null) return -this.countInBeats
    if (this.paused) return this.pausedBeat
    return (nowMs - this.t0) / this.beat
  }

  /** Zeitpunkt eines Schlags (performance.now()) */
  timeOf(beat: number): number {
    return (this.t0 ?? 0) + beat * this.beat
  }

  /** Läuft noch der Einzähler? */
  countingIn(nowMs: number) {
    return this.started && !this.paused && !this.finished && this.beatAt(nowMs) < this.countTo
  }

  get running() {
    return this.started && !this.paused && !this.finished
  }

  pause(nowMs: number) {
    if (!this.running) return
    // Pause im Einzähler: Die Stelle bleibt, wo sie war (nicht in den Einzähler zurück)
    this.pausedBeat = Math.max(this.countTo, this.beatAt(nowMs))
    // Töne, deren Fenster schon zu ist, bleiben verpasst: Beim Fortsetzen öffnet es nicht neu
    for (const n of this.notes) if (n.state === 'pending' && this.timeOf(n.start) + this.win.near < nowMs) n.state = 'missed'
    this.paused = true
    // Gehaltene Töne enden mit der Pause (ihre Haltedauer zählt nicht)
    for (const n of this.notes) if (n.onMs !== null && n.offMs === null) n.offMs = nowMs
  }

  /** Schläge des Einzählers (ganze Schläge, damit der Puls nach dem Fortsetzen nicht stolpert) */
  countInClicks(): number[] {
    const first = Math.ceil(this.countTo - this.countInBeats - 1e-9)
    const out: number[] = []
    for (let k = first; k < this.countTo - 1e-9; k++) out.push(k)
    return out
  }

  /** Erster Schlag nach dem Einzähler, auf dem das Metronom klickt */
  get firstBeat(): number {
    return Math.ceil(this.countTo - 1e-9)
  }

  /** Anzeige des Einzählers: welche Zahl (1 bis 4) und wie weit ihr Schlag ist; null außerhalb */
  countInShown(nowMs: number): { n: number; frac: number } | null {
    if (!this.countingIn(nowMs)) return null
    const b = this.beatAt(nowMs)
    const first = this.countInClicks()[0]
    if (first === undefined || b < first) return null
    return { n: Math.floor(b) - first + 1, frac: b - Math.floor(b) }
  }

  /** Weiter an der Pausenstelle, wieder mit einem Takt Einzähler */
  resume(nowMs: number, leadMs = 150) {
    if (!this.paused) return
    this.t0 = nowMs + leadMs + this.countInBeats * this.beat - this.pausedBeat * this.beat
    this.countTo = this.pausedBeat
    this.paused = false
    if (this.passStart < 0) this.passStart = this.timeOf(this.from)
  }

  /** Beginnt der Durchgang mittendrin (gespult)? Dann liegt mindestens ein Ton vor dem Start */
  get partial() {
    return this.notes.some((n) => n.start < this.from - 1e-6)
  }

  /** Töne, die in diesem Durchgang zählen (ab der gespulten Stelle) */
  private get counted() {
    return this.notes.filter((n) => n.start >= this.from - 1e-6)
  }

  /**
   * Spulen: angehalten an `beat` (meist ein Taktanfang). Alle Wertungen beginnen neu, Töne davor
   * zählen nicht mehr. „Weiter“ zählt einen Takt ein und läuft ab hier.
   */
  seek(beat: number) {
    for (const n of this.notes) Object.assign(n, { state: 'pending', deltaMs: 0, onMs: null, offMs: null, hold: null, source: null })
    this.from = Math.max(0, beat)
    this.wrong = 0
    this.wrongBars = []
    this.hintedNotes = new Set()
    this.feedback = []
    this.sourceHits = {}
    this.holdGraded = true
    this.finished = false
    this.pausedBeat = this.from
    this.countTo = this.from
    // Zählt als begonnen (angehalten), damit „Weiter“ von hier einzählt
    if (this.t0 === null) this.t0 = 0
    this.paused = true
    this.passStart = -1
  }

  /** Ankunftszeit auf den Anschlag zurückrechnen (Mikrofon: Erkennungsdauer) */
  private onsetOf(e: NoteOn) {
    return e.source === 'mic' ? e.tMs - MIC_LATENCY_MS : e.tMs
  }

  private judge(e: NoteOn, verdict: Verdict, step = -1, deltaMs?: number) {
    this.onJudge?.({
      ...(e.id !== undefined ? { id: e.id } : {}),
      midi: e.midi,
      tMs: e.tMs,
      source: e.source,
      verdict,
      step,
      atMs: e.tMs,
      ...(deltaMs !== undefined ? { deltaMs } : {}),
    })
  }

  input(e: NoteOn) {
    if (!this.running) return this.judge(e, 'ignored')
    const t = this.onsetOf(e)
    const win = e.source === 'mic' ? windowsFor(this.beat, 'mic') : this.win
    // Dieselbe Taste neu angeschlagen, ohne dass ein Loslassen kam: Der vorige Ton endet hier
    for (const n of this.notes) if (n.midi === e.midi && n.onMs !== null && n.offMs === null) this.release({ ...e, tMs: t })
    // Vor dem ersten Fenster (während des Einzählers) zählt nichts: man sucht noch die Hand
    const first = this.counted.find((n) => n.state === 'pending')
    if (first && t < this.timeOf(first.start) - win.near && this.beatAt(t) < this.countTo) return this.judge(e, 'ignored')
    let best: JudgedNote | null = null
    let bestD = Infinity
    for (const n of this.counted) {
      if (n.state !== 'pending' || n.midi !== e.midi) continue
      const d = t - this.timeOf(n.start)
      if (Math.abs(d) <= win.near && Math.abs(d) < Math.abs(bestD)) {
        best = n
        bestD = d
      }
    }
    if (!best) {
      this.wrong++
      this.wrongBars.push(Math.max(1, barOf(this.lesson, Math.max(0, this.beatAt(t)))))
      this.feedback.push({ midi: e.midi, kind: 'wrong', tMs: e.tMs })
      this.judge(e, 'wrong')
      return
    }
    best.state = Math.abs(bestD) <= win.onTime ? 'onTime' : 'near'
    best.deltaMs = Math.round(bestD)
    best.onMs = t
    best.source = e.source
    if (e.source === 'mic') this.holdGraded = false
    this.sourceHits[e.source] = (this.sourceHits[e.source] ?? 0) + 1
    this.judge(e, best.state === 'onTime' ? 'hit' : bestD < 0 ? 'early' : 'late', this.notes.indexOf(best), best.deltaMs)
    this.feedback.push({
      midi: e.midi,
      kind: best.state === 'onTime' ? 'hit' : bestD < 0 ? 'early' : 'late',
      hand: best.hand,
      tMs: e.tMs,
    })
  }

  release(e: NoteOff) {
    const n = this.notes.find((x) => x.midi === e.midi && x.onMs !== null && x.offMs === null)
    if (!n) return
    n.offMs = e.tMs
    if (!this.running || n.source === 'mic') return
    // Auch nach einem vorläufigen „zu lang“ aus dem Bildtakt: Der Zeitstempel des Loslassens entscheidet
    n.hold = holdGrade(e.tMs - n.onMs!, n.dur * this.beat, this.beat)
    if (n.hold === 'short') this.feedback.push({ midi: n.midi, kind: 'short', hand: n.hand, tMs: e.tMs })
  }

  /** Pro Bild aufrufen: verpasste Töne, zu lange gehaltene, Ende des Durchgangs */
  tick(nowMs: number) {
    this.feedback = this.feedback.filter((f) => nowMs - f.tMs < 1100)
    if (!this.running) return
    // Das Mikrofon meldet spät: erst nach seiner Verzögerung als verpasst werten
    const grace = MIC_LATENCY_MS + MIC_EXTRA_MS
    for (const n of this.notes) {
      const at = this.timeOf(n.start)
      if (n.state === 'pending' && nowMs > at + this.win.near + grace) n.state = 'missed'
      if (n.onMs !== null && n.offMs === null && !n.hold && n.source !== 'mic') {
        if (nowMs - n.onMs > n.dur * this.beat + this.win.holdOver) {
          n.hold = 'long'
          this.feedback.push({ midi: n.midi, kind: 'long', hand: n.hand, tMs: nowMs })
        }
      }
    }
    if (this.beatAt(nowMs) > this.lastBeat + 1 && this.counted.every((n) => n.state !== 'pending')) this.finish(nowMs)
  }

  private finish(nowMs: number) {
    this.finished = true
    for (const n of this.notes) if (n.onMs !== null && n.offMs === null) n.offMs = nowMs
    const s = scoreTempoPass(this.counted, this.wrong, this.holdGraded, this.lesson, this.wrongBars)
    this.onPass({
      clean: s.clean,
      wrong: this.wrong,
      durationMs: nowMs - this.passStart,
      unverified: 0,
      short: s.short,
      source: Object.entries(this.sourceHits).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'touch',
      percent: s.percent,
      missedBars: s.missedBars,
      tempo: this.tempo,
      onTime: s.onTime,
      near: s.near,
      missed: s.missed,
      long: s.long,
      holdGraded: this.holdGraded,
      drift: s.drift,
      hinted: this.hintedNotes.size,
      ...(this.partial ? { from: { beat: this.from, bar: barOf(this.lesson, this.from) } } : {}),
      timing: this.notes.map((n) => (n.state === 'onTime' || n.state === 'near' ? n.deltaMs : null)),
      held: this.notes.map((n) =>
        n.hold && n.onMs !== null && n.offMs !== null ? Math.round((100 * (n.offMs - n.onMs)) / (n.dur * this.beat)) : null,
      ),
    })
  }

  /** Töne, die gerade klingen sollen (für die Einfärbung der Tasten) */
  soundingAt(beat: number): JudgedNote[] {
    return this.notes.filter((n) => n.start <= beat + 0.02 && beat < n.start + n.dur - 0.02)
  }
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x))
}
