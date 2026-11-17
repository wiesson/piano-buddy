import { notesForStage, toSteps, type Lesson, type Stage, type Step } from '../music/lessons'
import type { NoteOn } from '../input/sources'

/**
 * Warte-Modus: Die Noten stehen, bis die richtigen Tasten angeschlagen sind.
 * Ein Durchgang ist „sauber“, wenn kein falscher Ton dazwischen kam. Gezählt werden
 * saubere Durchgänge (nicht Minuten): Sie sagen den Lernerfolg am besten voraus.
 */

/** Wie lange ein Anschlag, der kurz vor dem Schrittwechsel kam, noch für den neuen Schritt zählt */
const CARRY_MS = 450
/** Fremd-Anschläge erst nach dieser Frist als Fehler werten: vielleicht gehören sie zum nächsten Schritt */
const WRONG_DELAY_MS = 350

export interface Feedback {
  midi: number
  kind: 'hit' | 'wrong'
  tMs: number
}

export interface PassResult {
  clean: boolean
  wrong: number
  durationMs: number
  /** Töne, die das Mikrofon nicht sicher prüfen konnte (Oberton eines gleichzeitig erwarteten tieferen Tons) */
  unverified: number
}

/** Liegt m auf einem Oberton eines anderen Tons desselben Schritts (Oktave, Duodezime, Doppeloktave)? */
const masked = (notes: ReadonlySet<number>, m: number) => [12, 19, 24].some((d) => notes.has(m - d))

export class WaitSession {
  readonly steps: Step[]
  index = 0
  struck = new Set<number>()
  wrongCount = 0
  unverified = 0
  feedback: Feedback[] = []
  private recent: (NoteOn & { used: boolean })[] = []
  private passStart = 0
  stepStartedAt = 0

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
    this.recent.push({ ...e, used: false })
    this.recent = this.recent.filter((r) => e.tMs - r.tMs < 2000)
    this.consume(e.tMs)
  }

  /** Regelmäßig aufrufen (pro Animationsframe), damit verzögerte Fehler gewertet werden */
  tick(nowMs: number) {
    for (const r of this.recent) {
      if (r.used || nowMs - r.tMs < WRONG_DELAY_MS) continue
      r.used = true
      this.wrongCount++
      this.feedback.push({ midi: r.midi, kind: 'wrong', tMs: nowMs })
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
        if (r.source === 'mic' && masked(exp, r.midi)) this.unverified++
        this.struck.add(r.midi)
        this.feedback.push({ midi: r.midi, kind: 'hit', tMs: nowMs })
      }
      if ([...exp].every((m) => this.struck.has(m))) {
        this.index++
        this.struck = new Set()
        this.stepStartedAt = nowMs
        advanced = true
        if (this.index >= this.steps.length) {
          this.onPass({
            clean: this.wrongCount === 0,
            wrong: this.wrongCount,
            durationMs: nowMs - this.passStart,
            unverified: this.unverified,
          })
          return
        }
      }
    }
  }

  restart() {
    this.index = 0
    this.struck = new Set()
    this.wrongCount = 0
    this.unverified = 0
    this.recent = []
    this.passStart = 0
    this.stepStartedAt = performance.now()
  }

  get finished() {
    return this.index >= this.steps.length
  }
}
