import { barOf, notesForStage, toSteps, type Lesson, type Stage, type Step } from '../music/lessons'
import { percentOf } from './score'
import type { InputSource, NoteOff, NoteOn } from '../input/events'

/**
 * Warte-Modus: Die Noten stehen, bis die richtigen Tasten angeschlagen sind.
 * Ein Durchgang ist „sauber“, wenn kein falscher Ton dazwischen kam. Gezählt werden
 * saubere Durchgänge (nicht Minuten): Sie sagen den Lernerfolg am besten voraus.
 *
 * Daneben zählt, wie viele Schritte beim ersten Anschlag richtig waren (Prozent): Ein falscher
 * Ton kostet nur seinen Schritt, nicht den ganzen Durchgang.
 *
 * Schonfrist: Bis der erste richtige Ton kommt, zählen falsche Töne nicht (man sucht die
 * Starttaste). Der erste richtige Ton startet den Durchgang.
 */

/** Wie lange ein Anschlag, der kurz vor dem Schrittwechsel kam, noch für den neuen Schritt zählt */
export const CARRY_MS = 450
/** Töne des nächsten Schritts erst nach dieser Frist als Fehler werten: vielleicht kamen sie nur zu früh */
export const WRONG_DELAY_MS = 350
/** Lange Töne (halbe Note und länger) müssen gehalten werden: so viel ihrer Länge im Tempo des Stücks */
const HOLD_SHARE = 0.8
const HOLD_MIN_QUARTERS = 2
/** Höchstens so lange halten: Im Warte-Modus gibt der Spieler das Tempo vor, eine Ganze im
 *  Stücktempo (60 bpm: 3,2 s) fühlt sich dann endlos an. Halbe bleiben meist darunter. */
const HOLD_MAX_MS = 1500

/** Halbtonabstände der Teiltöne 2 bis 10 über dem Grundton */
const OVERTONE_STEPS = [12, 19, 24, 28, 31, 34, 36, 38, 40]

export interface Feedback {
  midi: number
  /** short: langer Ton zu früh losgelassen (Hinweis, kein Fehler) */
  kind: 'hit' | 'wrong' | 'short'
  tMs: number
}

/**
 * Was die Übe-Logik aus einem Anschlag gemacht hat. Jeder Anschlag bekommt genau ein Urteil (für
 * die Debug-Ebene und Mitschnitte):
 * - hit: richtig für den Schritt, der gerade dran war
 * - carried: kam kurz vor dem Schrittwechsel und zählt für den neuen Schritt (übernommen)
 * - early, late: Mitspielen, noch getroffen, aber knapp zu früh bzw. zu spät
 * - wrong: falsch (zählt als Fehler)
 * - grace: falsch vor dem ersten richtigen Ton (Schonfrist, zählt nicht)
 * - overtone: Mikrofon hörte einen Oberton (zählt nicht)
 * - ignored: Mitspielen außerhalb eines laufenden Durchgangs (Einzähler, Pause); Warten mit
 *   repeatOk: eine schon getroffene Taste nochmal angeschlagen
 * - dropped: noch offen, als der Durchgang neu begann (Neustart, Spulen)
 */
export type Verdict = 'hit' | 'carried' | 'early' | 'late' | 'wrong' | 'grace' | 'overtone' | 'ignored' | 'dropped'

export interface Judgement {
  /** Kennung aus dem NoteOn, falls gesetzt */
  id?: number
  midi: number
  /** Zeit des Anschlags (Quelle) */
  tMs: number
  source: InputSource
  verdict: Verdict
  /** Schritt (Warten) bzw. Notenindex (Mitspielen), für den geurteilt wurde; -1: keiner */
  step: number
  /** Zeit des Urteils */
  atMs: number
  /** Mitspielen: Abweichung vom Notenbeginn in ms */
  deltaMs?: number
}

/** Fristen des Warte-Modus (ms); ohne Angabe die Standardwerte */
export interface WaitOptions {
  carryMs?: number
  wrongDelayMs?: number
  /** Auch Streutöne (weder jetzt noch als Nächstes dran) erst nach wrongDelayMs als falsch werten */
  strayDelay?: boolean
  /** Eine Taste, die im Schritt schon getroffen ist, nochmal anschlagen: kein Fehler */
  repeatOk?: boolean
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
  /** Anteil der Schritte, die beim ersten Anschlag richtig waren, 0–100 (abgerundet: 100 nur ohne Fehler) */
  percent: number
  /** Takte mit mindestens einem falschen Ton (Taktnummern wie in den Noten, aufsteigend) */
  missedBars: number[]
  /**
   * Nur gesetzt, wenn der Durchgang mittendrin begann (gespult): eine geübte Stelle ab diesem
   * Takt. Solche Durchgänge zählen nicht für Sterne, Bestwert und Plan, denn das Stück wurde
   * nicht von vorn gespielt.
   */
  from?: { beat: number; bar: number }
  /** Schritte (Warten) bzw. Töne (Mitspielen), bei denen die leuchtende Taste zu sehen war */
  hinted?: number
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
  /** repeat: beim Anschlag schon getroffen (mit repeatOk nie ein Fehler) */
  private recent: (NoteOn & { used: boolean; repeat?: boolean })[] = []
  /** Wird für jeden Anschlag genau einmal mit seinem Urteil aufgerufen */
  onJudge?: (j: Judgement) => void
  carryMs: number
  wrongDelayMs: number
  strayDelay: boolean
  repeatOk: boolean
  private passStart = 0
  stepStartedAt = 0
  /** Woher der Anschlag eines Tons im aktuellen Schritt kam (nur losgelassene Quellen müssen halten) */
  private struckBy = new Map<number, string>()
  /** Töne des eben abgeschlossenen Schritts (nachgefasste Akkordtöne zählen mit repeatOk nicht) */
  private lastStruck = new Set<number>()
  /** Ein langer Ton wird gerade gehalten: weiter erst nach `until` oder beim Loslassen */
  holding: { midis: Set<number>; start: number; until: number; beats: number } | null = null
  shortCount = 0
  /** Erst ein richtiger Ton startet den Durchgang; bis dahin zählen falsche Töne nicht */
  started = false
  /** Falsche Töne vor dem Start (Schonfrist), für einen sanften Hinweis auf die Starttaste */
  graceMisses = 0
  /** Schritte, in denen ein falscher Ton kam */
  private missedSteps = new Set<number>()
  /** Gespult: Der Durchgang beginnt an diesem Schritt bzw. Schlag (0: von vorn) */
  fromIndex = 0
  fromBeat = 0

  constructor(
    readonly lesson: Lesson,
    readonly stage: Stage,
    private onPass: (r: PassResult) => void,
    opts: WaitOptions = {},
  ) {
    this.steps = toSteps(notesForStage(lesson, stage))
    this.carryMs = opts.carryMs ?? CARRY_MS
    this.wrongDelayMs = opts.wrongDelayMs ?? WRONG_DELAY_MS
    this.strayDelay = opts.strayDelay ?? false
    this.repeatOk = opts.repeatOk ?? false
  }

  private judge(r: NoteOn, verdict: Verdict, atMs: number) {
    this.onJudge?.({ ...(r.id !== undefined ? { id: r.id } : {}), midi: r.midi, tMs: r.tMs, source: r.source, verdict, step: this.index, atMs })
  }

  /** Offene Anschläge verwerfen (Neustart, Ende, Sitzung wird ersetzt): jeder bekommt sein Urteil */
  drain(nowMs = performance.now()) {
    for (const r of this.recent) {
      if (r.used) continue
      r.used = true
      this.judge(r, 'dropped', nowMs)
    }
    this.recent = []
  }

  /** Schritte, bei denen die Taste als Hilfe leuchtete, bevor der Schritt geschafft war */
  private hintedSteps = new Set<number>()

  /** Die Anzeige meldet: Die Taste des aktuellen Schritts leuchtet gerade (Hilfe sichtbar) */
  markHinted() {
    if (!this.finished) this.hintedSteps.add(this.index)
  }

  /** Kam im aktuellen Schritt schon ein falscher Ton? */
  get stepMissed() {
    return this.missedSteps.has(this.index)
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
    // Neuer Ton während des Haltens (andere Hand, nächster Ton): Halten endet ohne Hinweis
    if (this.holding) this.endHold(e.tMs)
    if (this.finished) return this.judge(e, 'ignored', e.tMs)
    // Nochmal angeschlagen, was im Schritt schon sitzt (Akkord nachgefasst)
    const again = this.struck.has(e.midi) || (this.lastStruck.has(e.midi) && e.tMs - this.stepStartedAt < this.carryMs)
    // Ältere Anschläge fallen heraus (ohne Bilder, etwa im Hintergrund, auch ungewertet)
    for (const r of this.recent) {
      if (!r.used && e.tMs - r.tMs >= 2000) {
        r.used = true
        this.judge(r, 'dropped', e.tMs)
      }
    }
    this.recent = this.recent.filter((r) => e.tMs - r.tMs < 2000)
    this.recent.push({ ...e, used: false, repeat: again })
    this.consume(e.tMs)
    // Gehört der Ton weder hierher noch zum nächsten Schritt, ist er sofort falsch: Die
    // Rückmeldung kommt mit dem Anschlag, nicht spürbar danach
    const r = this.recent[this.recent.length - 1]
    if (!r) return
    if (!r.used && this.repeatOk && again && !this.upcoming.has(r.midi)) {
      r.used = true
      this.judge(r, 'ignored', e.tMs)
      return
    }
    if (!r.used && !this.upcoming.has(r.midi)) {
      // Mikrofon: Ein Oberton eines gerade gespielten oder erwarteten Tons ist kein Fehler des
      // Spielers, sondern ein Hörfehler der Erkennung (MIDI meldet exakt und zählt weiter)
      if (e.source === 'mic' && this.isOvertone(r.midi)) {
        r.used = true
        this.judge(r, 'overtone', e.tMs)
      } else if (!this.strayDelay) this.wrong(r, e.tMs)
    }
  }

  /** Liegt der Ton auf einem Teilton (2. bis 10.) eines Tons dieses, des vorigen oder des nächsten Schritts? */
  private isOvertone(midi: number) {
    const near = [this.steps[this.index - 1], this.step, this.steps[this.index + 1]]
    return near.some((st) => st?.notes.some((n) => OVERTONE_STEPS.includes(midi - n.midi)))
  }

  /** Töne des nächsten Schritts (können vor dem Weiterspringen ankommen) */
  private get upcoming(): ReadonlySet<number> {
    return new Set(this.steps[this.index + 1]?.notes.map((n) => n.midi) ?? [])
  }

  private wrong(r: NoteOn & { used: boolean; repeat?: boolean }, nowMs: number) {
    r.used = true
    // Nachgefasst und nicht gebraucht: mit repeatOk kein Fehler
    if (r.repeat && this.repeatOk) {
      this.judge(r, 'ignored', nowMs)
      return
    }
    // Schonfrist: auch ein Ton, der vor dem Start kam und erst jetzt (verzögert) gewertet wird
    if (!this.started || r.tMs < this.passStart) {
      this.graceMisses++
      this.judge(r, 'grace', nowMs)
      return
    }
    this.judge(r, 'wrong', nowMs)
    this.wrongCount++
    this.missedSteps.add(this.index)
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
      if (!r.used && nowMs - r.tMs >= this.wrongDelayMs) this.wrong(r, nowMs)
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
        if (r.tMs < this.stepStartedAt - this.carryMs) continue
        r.used = true
        this.judge(r, r.tMs < this.stepStartedAt ? 'carried' : 'hit', nowMs)
        if (!this.started) {
          this.started = true
          this.passStart = r.tMs
        }
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
    const ms = Math.min(HOLD_MAX_MS, ((beats * 60) / this.lesson.bpm) * 1000 * HOLD_SHARE)
    return { midis: new Set(long.map((n) => n.midi)), start: nowMs, until: nowMs + ms, beats }
  }

  /** Zum nächsten Schritt; true, wenn der Durchgang damit fertig ist */
  private advance(nowMs: number) {
    this.index++
    this.lastStruck = this.struck
    this.struck = new Set()
    this.struckBy = new Map()
    this.stepStartedAt = nowMs
    if (this.index < this.steps.length) return false
    // Was jetzt noch offen ist, gehört zu keinem Schritt mehr und ändert das Ergebnis nicht
    this.drain(nowMs)
    this.onPass({
      clean: this.wrongCount === 0,
      wrong: this.wrongCount,
      durationMs: nowMs - this.passStart,
      unverified: this.unverified,
      short: this.shortCount,
      source: Object.entries(this.sourceHits).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'touch',
      percent: percentOf(this.steps.length - this.fromIndex, this.missedSteps.size),
      hinted: this.hintedSteps.size,
      missedBars: [...new Set([...this.missedSteps].map((i) => barOf(this.lesson, this.steps[i].start)))].sort((a, b) => a - b),
      ...(this.partial ? { from: { beat: this.fromBeat, bar: barOf(this.lesson, this.fromBeat) } } : {}),
    })
    return true
  }

  /** Beginnt der Durchgang mittendrin (gespult)? */
  get partial() {
    return this.fromIndex > 0
  }

  /**
   * Spulen: Der Durchgang beginnt neu am ersten Schritt ab `beat` (meist ein Taktanfang). Liegt
   * davor kein Schritt, ist es ein Neustart von vorn. Bis zum ersten richtigen Ton gilt wieder die
   * Schonfrist.
   */
  seek(beat: number) {
    const i = this.steps.findIndex((st) => st.start >= beat - 1e-6)
    this.restart()
    if (i <= 0) return
    this.index = i
    this.fromIndex = i
    this.fromBeat = beat
  }

  /** Nochmal wie zuletzt: ab der gespulten Stelle, sonst von vorn */
  again() {
    if (this.partial) this.seek(this.fromBeat)
    else this.restart()
  }

  restart() {
    const now = performance.now()
    this.drain(now)
    this.holding = null
    this.shortCount = 0
    this.struckBy = new Map()
    this.index = 0
    this.fromIndex = 0
    this.fromBeat = 0
    this.struck = new Set()
    this.lastStruck = new Set()
    this.wrongCount = 0
    this.missedSteps = new Set()
    this.hintedSteps = new Set()
    this.started = false
    this.graceMisses = 0
    this.unverified = 0
    this.sourceHits = {}
    this.recent = []
    this.passStart = 0
    this.stepStartedAt = now
  }

  get finished() {
    return this.index >= this.steps.length
  }
}
