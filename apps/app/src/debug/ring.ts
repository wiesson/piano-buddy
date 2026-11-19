import type { NoteOff, NoteOn } from '@piano/core/input/events'
import type { Judgement, Verdict } from '@piano/core/practice/session'

/**
 * Ereignis-Ring der Debug-Ebene (STU-1286): jeder Anschlag mit Quelle, Stärke, Zeiten (Quelle,
 * Ankunft im Handler, erstes Bild danach), was erwartet war, ob die Taste da schon leuchtete, und
 * was die Übe-Logik daraus gemacht hat. Dazu Marken (Phase, Schritt, Pedal, Loslassen,
 * Einstellungen). Läuft immer mit, nur im Speicher; gesendet wird nur auf „Melden“.
 */

/** Bedienung statt Spiel: Die Taste hat das Vorspielen beendet, den Einzähler gestartet usw. */
export type RingVerdict = Verdict | 'control'

export interface Strike {
  id: number
  midi: number
  source: NoteOn['source']
  velocity?: number
  /** Zeit des Anschlags laut Quelle (performance.now()-Basis) */
  tMs: number
  /** Ankunft im Handler */
  arrMs: number
  /** Erstes Bild, das nach der Ankunft gezeichnet wurde */
  frameMs?: number
  /** Töne des Schritts, der beim Anschlag dran war (Warten) bzw. die gerade klingen sollten */
  expected: number[]
  /** Leuchtete die Taste dieses Tons im letzten Bild vor dem Anschlag? */
  lit: boolean
  phase: string
  verdict?: RingVerdict
  /** Kurztext zur Bedienung bzw. Abweichung (Mitspielen) */
  note?: string
  verdictMs?: number
  step?: number
  deltaMs?: number
  offMs?: number
}

export interface Mark {
  tMs: number
  kind: 'phase' | 'step' | 'pedal' | 'release' | 'setting' | 'report'
  text: string
}

const KEEP_MS = 60_000
/** Obergrenze auch nach Zahl: Ein dichter Lauf soll Ring und Bericht nicht aufblähen */
const MAX_STRIKES = 1500
const MAX_MARKS = 1500

export class DebugRing {
  strikes: Strike[] = []
  marks: Mark[] = []
  private nextId = 1
  /** Zählt mit, damit die Anzeige weiß, ob sich etwas geändert hat */
  version = 0

  strike(e: NoteOn, ctx: { expected: Iterable<number>; lit: boolean; phase: string }): Strike {
    const s: Strike = {
      id: this.nextId++,
      midi: e.midi,
      source: e.source,
      velocity: e.velocity,
      tMs: e.tMs,
      arrMs: performance.now(),
      expected: [...ctx.expected],
      lit: ctx.lit,
      phase: ctx.phase,
    }
    this.strikes.push(s)
    this.trim(s.arrMs)
    this.version++
    return s
  }

  get(id: number | undefined) {
    if (id === undefined) return undefined
    for (let i = this.strikes.length - 1; i >= 0; i--) if (this.strikes[i].id === id) return this.strikes[i]
    return undefined
  }

  /** Urteil der Übe-Logik dem Anschlag zuordnen: über die Kennung, sonst gleicher Ton und Quellzeit */
  judge(j: Judgement) {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i]
      if (j.id !== undefined ? s.id !== j.id : s.verdict || s.midi !== j.midi || s.tMs !== j.tMs) continue
      s.verdict = j.verdict
      s.verdictMs = j.atMs
      s.step = j.step
      if (j.deltaMs !== undefined) s.deltaMs = j.deltaMs
      this.version++
      return
    }
  }

  control(s: Strike, note: string) {
    s.verdict = 'control'
    s.note = note
    s.verdictMs = performance.now()
    this.version++
  }

  release(e: NoteOff) {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i]
      if (s.midi === e.midi && s.offMs === undefined) {
        s.offMs = e.tMs
        break
      }
    }
    this.version++
  }

  mark(kind: Mark['kind'], text: string, tMs = performance.now()) {
    this.marks.push({ tMs, kind, text })
    this.trim(tMs)
    this.version++
  }

  /** Pro gezeichnetem Bild: Anschläge ohne Bild bekommen dieses */
  frame(nowMs: number) {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i]
      if (s.frameMs !== undefined) break
      if (s.arrMs <= nowMs) s.frameMs = nowMs
    }
  }

  /** Alles der letzten `ms` Millisekunden */
  since(ms: number, nowMs = performance.now()) {
    return {
      strikes: this.strikes.filter((s) => s.arrMs >= nowMs - ms),
      marks: this.marks.filter((m) => m.tMs >= nowMs - ms),
    }
  }

  private trim(nowMs: number) {
    if (this.strikes.length > 50 && this.strikes[0].arrMs < nowMs - KEEP_MS) this.strikes = this.strikes.filter((s) => s.arrMs >= nowMs - KEEP_MS)
    if (this.marks.length > 100 && this.marks[0].tMs < nowMs - KEEP_MS) this.marks = this.marks.filter((m) => m.tMs >= nowMs - KEEP_MS)
    if (this.strikes.length > MAX_STRIKES) this.strikes = this.strikes.slice(-MAX_STRIKES)
    if (this.marks.length > MAX_MARKS) this.marks = this.marks.slice(-MAX_MARKS)
  }
}

export interface SourceStats {
  source: string
  n: number
  /** Anschlag laut Quelle bis Ankunft im Handler */
  event: { mean: number; p95: number }
  /** Anschlag bis zum ersten Bild danach */
  frame: { mean: number; p95: number }
}

const pct = (xs: number[], p: number) => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)

/** Latenz je Quelle über die gegebenen Anschläge */
export function latencyBySource(strikes: Strike[]): SourceStats[] {
  const by = new Map<string, Strike[]>()
  for (const s of strikes) {
    const list = by.get(s.source)
    if (list) list.push(s)
    else by.set(s.source, [s])
  }
  return [...by].map(([source, list]) => {
    const ev = list.map((s) => s.arrMs - s.tMs)
    const fr = list.filter((s) => s.frameMs !== undefined).map((s) => s.frameMs! - s.tMs)
    return { source, n: list.length, event: { mean: mean(ev), p95: pct(ev, 0.95) }, frame: { mean: mean(fr), p95: pct(fr, 0.95) } }
  })
}

/** Streuung im Akkord: Anschläge, die näher als 80 ms beieinander liegen, als eine Gruppe */
export function chordSpread(strikes: Strike[]): { groups: number; mean: number; max: number } {
  const sorted = strikes.filter((s) => s.source === 'midi').sort((a, b) => a.tMs - b.tMs)
  const spreads: number[] = []
  let group: Strike[] = []
  const close = () => {
    if (group.length > 1) spreads.push(group[group.length - 1].tMs - group[0].tMs)
    group = []
  }
  for (const s of sorted) {
    if (group.length && s.tMs - group[group.length - 1].tMs > 80) close()
    group.push(s)
  }
  close()
  return { groups: spreads.length, mean: mean(spreads), max: spreads.length ? Math.max(...spreads) : NaN }
}

/** Anteil angenommener Töne, deren Taste beim Anschlag noch nicht leuchtete (Ziel: 0) */
export function acceptedUnlit(strikes: Strike[]) {
  const ok = strikes.filter((s) => s.verdict === 'hit' || s.verdict === 'carried' || s.verdict === 'early' || s.verdict === 'late')
  return { n: ok.length, unlit: ok.filter((s) => !s.lit).length }
}

export const debugRing = new DebugRing()
