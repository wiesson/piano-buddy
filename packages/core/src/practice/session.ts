import { notesForStage, toSteps, type Lesson, type Stage, type Step } from '../music/lessons'
import type { NoteOff, NoteOn } from '../input/events'

/**
 * Warte-Modus: Die Noten stehen, bis die richtigen Tasten angeschlagen sind.
 * Ein Durchgang ist „sauber“, wenn kein falscher Ton dazwischen kam. Gezählt werden
 * saubere Durchgänge (nicht Minuten): Sie sagen den Lernerfolg am besten voraus.
 */

/** Wie lange ein Anschlag, der kurz vor dem Schrittwechsel kam, noch für den neuen Schritt zählt */
const CARRY_MS = 450
/** Töne des nächsten Schritts erst nach dieser Frist als Fehler werten: vielleicht kamen sie nur zu früh */
const WRONG_DELAY_MS = 350
/** Lange Töne (halbe Note und länger) müssen gehalten werden: so viel ihrer Länge im Tempo des Stücks */
const HOLD_SHARE = 0.8
const HOLD_MIN_QUARTERS = 2

export interface Feedback {
  midi: number
  /** short: langer Ton zu früh losgelassen (Hinweis, kein Fehler) */
  kind: 'hit' | 'wrong' | 'short'
  tMs: number
}

export interface PassResult {
  clean: boolean
  wrong: number
  durationMs: number
  /** Töne, die das Mikrofon nicht sicher prüfen konnte (Oberton eines gleichzeitig erwarteten tieferen Tons) */
  unverified: number
  /** Lange Töne, die zu früh losgelassen wurden (zählt nicht als Fehler) */
  short: number
  /** Überwiegende Eingabe in diesem Durchgang */
  source: string
}

/** Liegt m auf einem Oberton eines anderen Tons desselben Schritts (Oktave, Duodezime, Doppeloktave)? */
const masked = (notes: ReadonlySet<number>, m: number) => [12, 19, 24].some((d) => notes.has(m - d))

export class WaitSession {
  readonly steps: Step[]
  index = 0
  struck = new Set<number>()
  wrongCount = 0
  unverified = 0
  private sourceHits: Record<string, number> = {}
  feedback: Feedback[] = []
  private recent: (NoteOn & { used: boolean })[] = []
  private passStart = 0
  stepStartedAt = 0
  /** Woher der Anschlag eines Tons im aktuellen Schritt kam (nur losgelassene Quellen müssen halten) */
  private struckBy = new Map<number, string>()
  /** Ein langer Ton wird gerade gehalten: weiter erst nach `until` oder beim Loslassen */
  holding: { midis: Set<number>; start: number; until: number; beats: number } | null = null
  shortCount = 0

  constructor(
    readonly lesson: Lesson,
    readonly stage: Stage,
    private onPass: (r: PassResult) => void,
  ) {
    this.steps = toSteps(notesForStage(lesson, stage))
  }

  get step(): Step | undefined {
    return this.steps[this.index]
  }

  get expected(): ReadonlySet<number> {
    return new Set(this.step?.notes.map((n) => n.midi) ?? [])
  }

  /** Musikalische Position in Schlägen, für die Anzeige (gleitet zum nächsten Schritt) */
  get beat(): number {
    return this.step?.start ?? 0
  }

  input(e: NoteOn) {
    if (!this.passStart) this.passStart = e.tMs
    // Neuer Ton während des Haltens (andere Hand, nächster Ton): Halten endet ohne Hinweis
    if (this.holding) this.endHold(e.tMs)
    this.recent.push({ ...e, used: false })
    this.recent = this.recent.filter((r) => e.tMs - r.tMs < 2000)
    this.consume(e.tMs)
    // Gehört der Ton weder hierher noch zum nächsten Schritt, ist er sofort falsch: Die
    // Rückmeldung kommt mit dem Anschlag, nicht spürbar danach
    const r = this.recent[this.recent.length - 1]
    if (r && !r.used && !this.upcoming.has(r.midi)) this.wrong(r, e.tMs)
  }

  /** Töne des nächsten Schritts (können vor dem Weiterspringen ankommen) */
  private get upcoming(): ReadonlySet<number> {
    return new Set(this.steps[this.index + 1]?.notes.map((n) => n.midi) ?? [])
  }

  private wrong(r: { used: boolean; midi: number }, nowMs: number) {
    r.used = true
    this.wrongCount++
    this.feedback.push({ midi: r.midi, kind: 'wrong', tMs: nowMs })
  }

  /** Losgelassen: Wer einen langen Ton zu früh loslässt, bekommt einen Hinweis, dann geht es weiter */
  release(e: NoteOff) {
    const h = this.holding
    if (!h || !h.midis.has(e.midi)) return
    if (e.tMs < h.until) {
      this.shortCount++
      this.feedback.push({ midi: e.midi, kind: 'short', tMs: e.tMs })
    }
    this.endHold(e.tMs)
  }

  /** Wie weit das Halten ist, 0..1 (null, wenn gerade nichts gehalten wird) */
  holdProgress(nowMs: number): number | null {
    const h = this.holding
    if (!h) return null
    return Math.min(1, Math.max(0, (nowMs - h.start) / Math.max(1, h.until - h.start)))
  }

  private endHold(nowMs: number) {
    if (!this.holding) return
    this.holding = null
    this.advance(nowMs)
    this.consume(nowMs)
  }

  /** Regelmäßig aufrufen (pro Animationsframe), damit verzögerte Fehler gewertet werden */
  tick(nowMs: number) {
    if (this.holding && nowMs >= this.holding.until) this.endHold(nowMs)
    for (const r of this.recent) {
      if (!r.used && nowMs - r.tMs >= WRONG_DELAY_MS) this.wrong(r, nowMs)
    }
    this.feedback = this.feedback.filter((f) => nowMs - f.tMs < 900)
  }

  private consume(nowMs: number) {
    let advanced = true
    while (advanced && this.step) {
      advanced = false
      const exp = this.expected
      for (const r of this.recent) {
        if (r.used || !exp.has(r.midi) || this.struck.has(r.midi)) continue
        if (r.tMs < this.stepStartedAt - CARRY_MS) continue
        r.used = true
        this.struckBy.set(r.midi, r.source)
        if (r.source === 'mic' && masked(exp, r.midi)) this.unverified++
        this.sourceHits[r.source] = (this.sourceHits[r.source] ?? 0) + 1
        this.struck.add(r.midi)
        this.feedback.push({ midi: r.midi, kind: 'hit', tMs: nowMs })
      }
      if (!this.holding && [...exp].every((m) => this.struck.has(m))) {
        // Lange Töne erst halten (nicht beim Mikrofon: es hört das Loslassen nicht)
        const hold = this.holdFor(nowMs)
        if (hold) {
          this.holding = hold
          return
        }
        if (this.advance(nowMs)) return
        advanced = true
      }
    }
  }

  /** Lange Töne des aktuellen Schritts, die gehalten werden müssen */
  private holdFor(nowMs: number) {
    const step = this.step
    if (!step) return null
    const unit = this.lesson.beatUnit ?? 4
    const long = step.notes.filter(
      (n) => (n.dur * 4) / unit >= HOLD_MIN_QUARTERS && this.struckBy.has(n.midi) && this.struckBy.get(n.midi) !== 'mic',
    )
    if (!long.length) return null
    const beats = Math.max(...long.map((n) => n.dur))
    const ms = ((beats * 60) / this.lesson.bpm) * 1000 * HOLD_SHARE
    return { midis: new Set(long.map((n) => n.midi)), start: nowMs, until: nowMs + ms, beats }
  }

  /** Zum nächsten Schritt; true, wenn der Durchgang damit fertig ist */
  private advance(nowMs: number) {
    this.index++
    this.struck = new Set()
    this.struckBy = new Map()
    this.stepStartedAt = nowMs
    if (this.index < this.steps.length) return false
    this.onPass({
      clean: this.wrongCount === 0,
      wrong: this.wrongCount,
      durationMs: nowMs - this.passStart,
      unverified: this.unverified,
      short: this.shortCount,
      source: Object.entries(this.sourceHits).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'touch',
    })
    return true
  }

  restart() {
    this.holding = null
    this.shortCount = 0
    this.struckBy = new Map()
    this.index = 0
    this.struck = new Set()
    this.wrongCount = 0
    this.unverified = 0
    this.sourceHits = {}
    this.recent = []
    this.passStart = 0
    this.stepStartedAt = performance.now()
  }

  get finished() {
    return this.index >= this.steps.length
  }
}
