import type { Hand, Lesson, ScoreNote } from './lessons'
import { isBlack } from './notes'

/**
 * Element-Modell: was ein Stück von den Händen verlangt, berechnet aus den Noten (nichts wird von
 * Hand gepflegt). Zwei Ebenen:
 *
 * - `demandsOf` misst (Tonumfang, größter Griff, Sprünge, Dichte, Rhythmus, Taktart …).
 * - `elementsOf` macht daraus einzelne Elemente wie in Klavierschulen (Faber Piano Adventures,
 *   Alfred's Basic Piano): Lage, beide Hände, Achtel, punktiert, Auftakt, Taktart, schwarze
 *   Tasten, Daumenuntersatz, Lagenwechsel, Zweiklang, Dreiklang, Sprung, großer Umfang.
 *
 * Lage heißt hier: in welchem Bereich der Klaviatur eine Hand spielt, gemessen am mittleren C.
 * Rechts beginnt man auf C4 bis C5, links auf C3 bis C4; neu ist, wenn eine Hand darunter oder
 * darüber muss (rechts unter das mittlere C, links über das mittlere C). Das sind die Tasten, die
 * man noch nie benutzt hat.
 *
 * Rhythmus zählt in Schlägen, nicht in Notenwerten: halbe Schläge sind Achtel im 3/4-Takt und
 * Sechzehntel im 3/8-Takt. Was dort neu ist, ist die Taktart, nicht das Zählen.
 *
 * Tempo ist ein Messwert (`notesPerSecond`), kein Element: Jedes Stück wird ohnehin erst wartend,
 * dann in 60, 80 und 100 Prozent geübt.
 *
 * Ein Lernpfad führt pro Schritt höchstens ein neues Element ein (`newElements`). Der Pop-Pfad
 * (STU-1271) nutzt dieselben Elemente als Achsen seiner Übungen.
 *
 * Ob die Hand umsetzen muss, entscheidet der Fingersatz: Zwei Töne gehen ohne Umsetzen, wenn ihr
 * Abstand für das Fingerpaar bequem greifbar ist (Spannweiten nach Parncutt u. a. 1997, für eine
 * mittlere erwachsene Hand). Ohne Fingersatz wird die Lage aus dem Tonumfang geschätzt.
 */

export type ElementId =
  | 'both-hands'
  | 'hands-together'
  | `register:${Hand}:${Register}`
  | 'shift'
  | 'thumb-under'
  | 'black-keys'
  | 'dyad'
  | 'triad'
  | 'eighths'
  | 'sixteenths'
  | 'offbeat'
  | 'dotted'
  | 'pickup'
  | `meter:${string}`
  | 'leap'
  | 'wide-range'

/** Bereich einer Hand: der Anfangsbereich, darunter, darüber */
export type Register = 'mid' | 'low' | 'high'

/** Reihenfolge der Elementarten wie in den Klavierschulen; für Anzeige und stabile Sortierung */
export const ELEMENT_ORDER = [
  'register',
  'both-hands',
  'hands-together',
  'dotted',
  'eighths',
  'offbeat',
  'shift',
  'meter',
  'pickup',
  'thumb-under',
  'black-keys',
  'dyad',
  'triad',
  'leap',
  'wide-range',
  'sixteenths',
] as const

export type ElementKind = (typeof ELEMENT_ORDER)[number]

export const kindOf = (e: ElementId): ElementKind => e.split(':')[0] as ElementKind

export interface HandDemands {
  /** tiefster und höchster Ton (MIDI) */
  low: number
  high: number
  /** Umfang in Halbtönen */
  span: number
  /** verschiedene Tasten, aufsteigend */
  keys: number[]
  /** verschiedene schwarze Tasten */
  blackKeys: number
  /** meiste Töne, die diese Hand gleichzeitig anschlägt */
  maxChord: number
  /** Grundlage der Hand beim ersten Ton: tiefste Taste unter den fünf Fingern, z. B. „C4“ */
  home: string | null
  /** Bereiche der Klaviatur, in denen die Hand spielt */
  registers: Register[]
  /** Umsetzen der Hand ohne Daumenuntersatz */
  shifts: number
  /** Daumenuntersatz oder Übersetzen */
  crossings: number
  /** größter Sprung zwischen zwei Anschlägen in Halbtönen (kleinster Abstand der beiden Griffe) */
  maxLeap: number
  /** meiste Anschläge pro Sekunde in einem Takt (im Originaltempo) */
  notesPerSecond: number
  /** jeder Ton hat einen Fingersatz */
  fingered: boolean
}

export interface Demands {
  hands: Partial<Record<Hand, HandDemands>>
  /** beide Hände klingen irgendwann gleichzeitig */
  together: boolean
  /** Taktart wie notiert, z. B. „4/4“, „3/8“ */
  meter: string
  /** zusammengesetzte Taktart (6/8, 9/8, 12/8): punktierte Viertel sind dort der Grundschlag */
  compound: boolean
  pickup: boolean
  /** kürzester Notenwert in Schlägen (1 = ein Schlag, 0.5 = halber Schlag) */
  shortest: number
  /** punktierte Werte (1,5 oder 0,75 Schläge), außer in zusammengesetzten Taktarten */
  dotted: boolean
  /** eine Hand schlägt überwiegend auf der „und“ an, während sie auf dem Schlag schweigt */
  offbeat: boolean
  /** Tempo in Vierteln pro Minute */
  quarterBpm: number
  bars: number
}

const EPS = 1e-6

/**
 * Bequeme Spannweite je Fingerpaar in Halbtönen (Parncutt u. a. 1997, MinComf/MaxComf): vom
 * Ton des niedrigeren zum Ton des höheren Fingers, in Richtung der Hand gemessen (rechts
 * aufwärts, links abwärts). Negativ beim Daumen heißt: der Daumen liegt jenseits des Fingers,
 * also untergesetzt.
 */
const SPAN: Record<string, [number, number]> = {
  '1-2': [-3, 8],
  '1-3': [-2, 10],
  '1-4': [-1, 12],
  '1-5': [1, 13],
  '2-3': [1, 3],
  '2-4': [1, 5],
  '2-5': [2, 8],
  '3-4': [1, 4],
  '3-5': [1, 6],
  '4-5': [1, 4],
}

/** Mehr als eine Oktave zwischen zwei Anschlägen gilt als Sprung */
export const LEAP = 12
/** Mehr als eine Oktave Umfang in einer Hand */
export const WIDE = 12
/** Anfangsbereich je Hand: rechts C4–C5, links C3–C4 (MIDI) */
const MID: Record<Hand, [number, number]> = { R: [60, 72], L: [48, 60] }

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'H']
const WHITE_OF_PC = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
const FLAT_OF_PC = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6]

/** Stammtonstufe einer Note (C4 = 28): aus der Schreibweise, sonst aus der Tonart */
function stepOf(n: ScoreNote, key: number): number {
  const oct = Math.floor(n.midi / 12) - 1
  const pc = ((n.midi % 12) + 12) % 12
  let letter = n.spelling ? LETTERS.indexOf(n.spelling.charAt(0) === 'B' ? 'H' : n.spelling.charAt(0)) : -1
  // Deutsches B ist Hes: Stammton H
  if (n.spelling === 'B') letter = 6
  if (letter < 0) letter = key < 0 ? FLAT_OF_PC[pc] : WHITE_OF_PC[pc]
  // Ces und His liegen in der Nachbaroktave
  const octFix = letter === 6 && pc === 0 ? -1 : letter === 0 && pc === 11 ? 1 : 0
  return (oct + octFix) * 7 + letter
}

const stepName = (step: number) => `${LETTERS[((step % 7) + 7) % 7]}${Math.floor(step / 7)}`

/** Gruppen gleichzeitig anschlagender Töne einer Hand */
function onsets(notes: ScoreNote[]): ScoreNote[][] {
  const out: ScoreNote[][] = []
  for (const n of [...notes].sort((a, b) => a.start - b.start || a.midi - b.midi)) {
    const last = out[out.length - 1]
    if (last && Math.abs(last[0].start - n.start) < EPS) last.push(n)
    else out.push([n])
  }
  return out
}

type Move = 'stay' | 'cross' | 'shift'

/** Muss die Hand zwischen zwei Anschlägen umsetzen? Nach Fingersatz und Spannweite */
function moveBetween(hand: Hand, a: ScoreNote[], b: ScoreNote[]): Move {
  const dir = hand === 'R' ? 1 : -1
  // Wo jeder Finger nach dem Wechsel liegt: was b anschlägt, sonst was a hielt
  const at = new Map<number, number>()
  for (const n of a) at.set(n.finger!, n.midi)
  const chord = a.length > 1 || b.length > 1
  for (const n of b) {
    const before = at.get(n.finger!)
    // Derselbe Finger auf einer anderen Taste: umsetzen (im Akkord ist ein Halbton Nachgreifen)
    if (before !== undefined && before !== n.midi && (!chord || Math.abs(before - n.midi) > 2)) return 'shift'
  }
  for (const n of b) at.set(n.finger!, n.midi)
  let move: Move = 'stay'
  const fingers = [...at.keys()].sort()
  for (let i = 0; i < fingers.length; i++)
    for (let j = i + 1; j < fingers.length; j++) {
      const [lo, hi] = [fingers[i], fingers[j]]
      const span = SPAN[`${lo}-${hi}`]
      if (!span) continue
      const d = dir * (at.get(hi)! - at.get(lo)!)
      // Nur Paare, an denen der neue Anschlag beteiligt ist
      if (!b.some((n) => n.finger === lo || n.finger === hi)) continue
      // Daumen jenseits des Fingers: untergesetzt (oder Finger übergesetzt), soweit greifbar
      if (lo === 1 && d < 0 && d >= span[0] - 4) move = 'cross'
      else if (d < span[0] || d > span[1]) return 'shift'
    }
  return move
}

/** Die tiefste Taste unter den fünf Fingern, aus einem Ton mit Fingersatz */
function homeOf(hand: Hand, first: ScoreNote[], key: number): string | null {
  const low = first.reduce((a, b) => (b.midi < a.midi ? b : a))
  if (!low.finger) return null
  const s = stepOf(low, key)
  return stepName(hand === 'R' ? s - (low.finger - 1) : s - (5 - low.finger))
}

function handDemands(hand: Hand, notes: ScoreNote[], lesson: LessonShape, secPerQuarter: number): HandDemands {
  const key = lesson.key ?? 0
  const groups = onsets(notes)
  const keys = [...new Set(notes.map((n) => n.midi))].sort((a, b) => a - b)
  const fingered = notes.every((n) => n.finger !== undefined)
  let shifts = 0
  let crossings = 0
  let maxLeap = 0
  for (let i = 1; i < groups.length; i++) {
    const [a, b] = [groups[i - 1], groups[i]]
    const gap = Math.min(...a.flatMap((x) => b.map((y) => Math.abs(x.midi - y.midi))))
    maxLeap = Math.max(maxLeap, gap)
    if (fingered) {
      const m = moveBetween(hand, a, b)
      if (m === 'shift') shifts++
      if (m === 'cross') crossings++
    }
  }
  if (!fingered) {
    // Ohne Fingersatz: so oft umsetzen, wie Abschnitte über fünf Stammtöne hinausgehen
    let lo = Infinity
    let hi = -Infinity
    for (const g of groups)
      for (const n of g) {
        const s = stepOf(n, key)
        lo = Math.min(lo, s)
        hi = Math.max(hi, s)
        if (hi - lo > 4) {
          shifts++
          lo = hi = s
        }
      }
  }
  // Dichte: meiste Anschläge in einem Takt, geteilt durch die Taktdauer
  const perBar = new Map<number, number>()
  for (const g of groups) {
    const bar = Math.floor(g[0].start / lesson.beatsPerBar + EPS)
    perBar.set(bar, (perBar.get(bar) ?? 0) + 1)
  }
  const barSec = lesson.beatsPerBar * (4 / (lesson.beatUnit ?? 4)) * secPerQuarter
  const low = keys[0]
  const high = keys[keys.length - 1]
  const [m0, m1] = MID[hand]
  const registers: Register[] = []
  if (keys.some((k) => k >= m0 && k <= m1)) registers.push('mid')
  if (low < m0) registers.push('low')
  if (high > m1) registers.push('high')
  return {
    low,
    high,
    span: high - low,
    keys,
    blackKeys: keys.filter(isBlack).length,
    maxChord: Math.max(...groups.map((g) => g.length)),
    home: fingered ? homeOf(hand, groups[0], key) : stepName(stepOf(groups[0].reduce((a, b) => (b.midi < a.midi ? b : a)), key)),
    registers,
    shifts,
    crossings,
    maxLeap,
    notesPerSecond: Math.round((Math.max(...perBar.values()) / barSec) * 100) / 100,
    fingered,
  }
}

/** Was das Element-Modell von einem Stück braucht (eingebaute Lektion, Fassung oder eigenes Stück) */
export type LessonShape = Pick<Lesson, 'notes' | 'beatsPerBar' | 'beatUnit' | 'bpm' | 'key' | 'pickup'>

export function demandsOf(lesson: LessonShape): Demands {
  const unit = lesson.beatUnit ?? 4
  const toQuarters = 4 / unit
  const quarterBpm = lesson.bpm * toQuarters
  const secPerQuarter = 60 / quarterBpm
  const hands: Partial<Record<Hand, HandDemands>> = {}
  for (const h of ['L', 'R'] as const) {
    const ns = lesson.notes.filter((n) => n.hand === h)
    if (ns.length) hands[h] = handDemands(h, ns, lesson, secPerQuarter)
  }
  const L = lesson.notes.filter((n) => n.hand === 'L')
  const R = lesson.notes.filter((n) => n.hand === 'R')
  const together = L.some((l) => R.some((r) => l.start < r.start + r.dur - EPS && r.start < l.start + l.dur - EPS))
  const compound = unit === 8 && lesson.beatsPerBar % 3 === 0 && lesson.beatsPerBar > 3
  const durs = lesson.notes.map((n) => Math.round(n.dur * 1000) / 1000)
  const lastEnd = Math.max(0, ...lesson.notes.map((n) => n.start + n.dur))
  // Offbeat: Anschläge auf dem halben Schlag, vor denen die Hand auf dem Schlag stumm ist
  const offbeat = (['L', 'R'] as const).some((h) => {
    const ns = lesson.notes.filter((n) => n.hand === h)
    const starts = [...new Set(ns.map((n) => n.start))]
    const off = starts.filter((t) => {
      if (Math.abs(t - Math.floor(t) - 0.5) > EPS) return false
      const beat = Math.floor(t)
      return !ns.some((n) => n.start <= beat + EPS && n.start + n.dur > beat + EPS)
    })
    return starts.length > 0 && off.length * 2 >= starts.length
  })
  return {
    hands,
    together,
    meter: `${lesson.beatsPerBar}/${unit}`,
    compound,
    pickup: !!lesson.pickup,
    shortest: Math.min(...durs),
    dotted: !compound && durs.some((d) => d === 1.5 || d === 0.75),
    offbeat,
    quarterBpm,
    bars: Math.ceil(lastEnd / lesson.beatsPerBar - EPS),
  }
}

/** Die einzelnen Elemente eines Stücks, sortiert nach Klavierschul-Reihenfolge */
export function elementsOf(lesson: LessonShape): ElementId[] {
  const d = demandsOf(lesson)
  const out = new Set<ElementId>()
  const hs = Object.entries(d.hands) as [Hand, HandDemands][]
  for (const [h, hd] of hs) {
    for (const r of hd.registers) out.add(`register:${h}:${r}`)
    if (hd.shifts) out.add('shift')
    if (hd.crossings) out.add('thumb-under')
    if (hd.blackKeys) out.add('black-keys')
    if (hd.maxChord === 2) out.add('dyad')
    if (hd.maxChord >= 3) out.add('triad')
    if (hd.maxLeap > LEAP) out.add('leap')
    if (hd.span > WIDE) out.add('wide-range')
  }
  if (hs.length === 2) out.add('both-hands')
  if (d.together) out.add('hands-together')
  if (d.shortest < 0.5 - EPS) out.add('sixteenths')
  if (d.shortest < 1 - EPS) out.add('eighths')
  if (d.dotted) out.add('dotted')
  if (d.offbeat) out.add('offbeat')
  if (d.pickup) out.add('pickup')
  if (d.meter !== '4/4') out.add(`meter:${d.meter}`)
  const rank = (e: ElementId) => ELEMENT_ORDER.indexOf(kindOf(e))
  return [...out].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

/** Was ein Stück gegenüber dem schon Bekannten neu verlangt; wer Dreiklänge kann, kann Zweiklänge */
export function newElements(known: Iterable<ElementId>, lesson: LessonShape): ElementId[] {
  const k = new Set(known)
  if (k.has('triad')) k.add('dyad')
  return elementsOf(lesson).filter((e) => !k.has(e))
}
