import { de } from '../i18n/de'
import { en } from '../i18n/en'
import type { Localized } from '../i18n/localized'
import type { Hand, Lesson, ScoreNote } from './lessons'
import type { MidiFile } from './midiFile'

/**
 * Eigene Stücke aus MIDI-Dateien. Die Datei wird beim Import einmal gelesen, auf ein
 * Sechzehntel-Raster gezogen und als Stück gespeichert; welche Spur welche Hand spielt, bleibt
 * einstellbar. Daraus entstehen die Lernfassungen: das Stück in Teile zerlegt (Wiederholungen nur
 * einmal), jeder Teil erst leicht (Melodie und ein Grundton pro Takt), dann wie im Original, zum
 * Schluss das ganze Stück.
 */

/** Welche Hand eine Spur spielt; „split“ teilt sie am Trennton */
export type PartHand = Hand | 'split' | 'off'

export interface PieceNote {
  midi: number
  /** Beginn in Schlägen (in der Einheit der Taktart, wie bei den Lektionen) */
  start: number
  dur: number
}

export interface PiecePart {
  name: string
  hand: PartHand
  notes: PieceNote[]
}

export interface Piece {
  id: string
  title: string
  addedAt: number
  bpm: number
  beatsPerBar: number
  beatUnit: 4 | 8
  /** Tonart als Zahl der Kreuze (+) oder Bs (−), aus den Tönen geschätzt */
  key: number
  parts: PiecePart[]
  /** Trennton für Spuren mit „split“: ab diesem Ton rechts */
  split: number
}

/** Raster in Vierteln: Sechzehntel */
const GRID = 0.25
const EPS = 1e-6

/** Taktart der Datei in Schläge pro Takt und Schlageinheit, die die Notenansicht kann */
function meterOf(ts: { num: number; den: number } | undefined): { beatsPerBar: number; beatUnit: 4 | 8 } {
  if (!ts) return { beatsPerBar: 4, beatUnit: 4 }
  if (ts.den === 4 && ts.num > 0) return { beatsPerBar: ts.num, beatUnit: 4 }
  if (ts.den === 8 && ts.num > 0) return { beatsPerBar: ts.num, beatUnit: 8 }
  if (ts.den === 2 && ts.num > 0) return { beatsPerBar: ts.num * 2, beatUnit: 4 }
  if (ts.den === 16 && ts.num % 2 === 0) return { beatsPerBar: ts.num / 2, beatUnit: 8 }
  return { beatsPerBar: 4, beatUnit: 4 }
}

const round = (x: number) => Math.round(x * 1e6) / 1e6

/** Gleiche Töne nicht doppelt, und ein Ton endet, wo derselbe Ton neu anschlägt */
function tidy<T extends PieceNote>(notes: T[]): T[] {
  const sorted = [...notes].sort((a, b) => a.start - b.start || a.midi - b.midi || b.dur - a.dur)
  const out: T[] = []
  const lastOf = new Map<number, T>()
  for (const n of sorted) {
    const prev = lastOf.get(n.midi)
    if (prev && Math.abs(prev.start - n.start) < EPS) continue
    if (prev && prev.start + prev.dur > n.start + EPS) prev.dur = round(n.start - prev.start)
    const copy = { ...n }
    out.push(copy)
    lastOf.set(n.midi, copy)
  }
  return out
}

/** Tonart schätzen: die mit den wenigsten leitereigenen Abweichungen, bei Gleichstand weniger Vorzeichen */
export function guessKey(midis: number[]): number {
  const MAJOR = [0, 2, 4, 5, 7, 9, 11]
  let best = 0
  let bestMiss = Infinity
  for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
    const tonic = (((k * 7) % 12) + 12) % 12
    const miss = midis.filter((m) => !MAJOR.includes((((m - tonic) % 12) + 12) % 12)).length
    if (miss < bestMiss) {
      best = k
      bestMiss = miss
    }
  }
  return best
}

/** Aus der gelesenen Datei ein Stück machen: Raster, Taktanfang, Tempo, Hände nach Tonhöhe */
export function pieceFromMidi(file: MidiFile, meta: { id: string; title: string; addedAt: number }): Piece {
  const { beatsPerBar, beatUnit } = meterOf(file.timeSignatures[0])
  const perQuarter = beatUnit / 4
  const snap = (ticks: number) => Math.round(ticks / file.ppq / GRID) * GRID
  const usPerQuarter = file.tempos[0]?.usPerQuarter ?? 500_000
  const bpm = Math.min(300, Math.max(20, Math.round((60_000_000 / usPerQuarter) * perQuarter)))

  const raw = file.parts.map((p) =>
    tidy(
      p.notes.map((n) => {
        const start = snap(n.tick)
        const end = Math.max(start + GRID, snap(n.tick + n.durTicks))
        return { midi: n.midi, start: round(start * perQuarter), dur: round((end - start) * perQuarter) }
      }),
    ),
  )
  // Vorlauf bis zum Takt des ersten Tons weglassen
  const first = Math.min(...raw.flatMap((ns) => ns.map((n) => n.start)))
  const shift = Number.isFinite(first) ? Math.floor(first / beatsPerBar + EPS) * beatsPerBar : 0
  const parts: PiecePart[] = raw.map((notes, i) => ({
    name: file.parts[i].name,
    hand: 'split',
    notes: notes.map((n) => ({ ...n, start: round(n.start - shift) })),
  }))

  // Eine Spur: am Trennton teilen. Mehrere: die höchste rechts, die tiefste links, die übrigen
  // nach ihrer mittleren Lage
  if (parts.length > 1) {
    const avg = (p: PiecePart) => p.notes.reduce((s, n) => s + n.midi, 0) / p.notes.length
    const byPitch = [...parts].sort((a, b) => avg(b) - avg(a))
    for (const p of parts) p.hand = avg(p) >= 60 ? 'R' : 'L'
    byPitch[0].hand = 'R'
    byPitch[byPitch.length - 1].hand = 'L'
  }

  const all = parts.flatMap((p) => p.notes.map((n) => n.midi))
  return { ...meta, bpm, beatsPerBar, beatUnit, key: guessKey(all), parts, split: 60 }
}

/** Alle Töne des Stücks mit Hand, wie eingestellt */
export function pieceNotes(piece: Piece): ScoreNote[] {
  const out: ScoreNote[] = []
  for (const p of piece.parts) {
    if (p.hand === 'off') continue
    for (const n of p.notes) {
      const hand: Hand = p.hand === 'split' ? (n.midi >= piece.split ? 'R' : 'L') : p.hand
      out.push({ midi: n.midi, start: n.start, dur: n.dur, hand })
    }
  }
  // Derselbe Ton zur selben Zeit in zwei Spuren: einmal genügt
  return tidy(out).sort((a, b) => a.start - b.start || a.midi - b.midi)
}

/**
 * Leichte Fassung: rechts nur der oberste Ton jedes Anschlags (die Melodie), links ein Grundton
 * pro Takt, der tiefste Ton beim ersten Anschlag im Takt, gehalten bis Taktende.
 */
export function easyNotes(notes: ScoreNote[], beatsPerBar: number): ScoreNote[] {
  const right = notes.filter((n) => n.hand === 'R')
  const left = notes.filter((n) => n.hand === 'L')
  const melody: ScoreNote[] = []
  const onsets = [...new Set(right.map((n) => n.start))].sort((a, b) => a - b)
  onsets.forEach((t, i) => {
    const top = right.filter((n) => Math.abs(n.start - t) < EPS).reduce((a, b) => (b.midi > a.midi ? b : a))
    const next = onsets[i + 1]
    melody.push({ ...top, dur: next === undefined ? top.dur : round(Math.min(top.dur, next - t)) })
  })
  const roots: ScoreNote[] = []
  const bars = new Map<number, ScoreNote[]>()
  for (const n of left) {
    const bar = Math.floor(n.start / beatsPerBar + EPS)
    bars.set(bar, [...(bars.get(bar) ?? []), n])
  }
  for (const [bar, ns] of [...bars].sort((a, b) => a[0] - b[0])) {
    const t = Math.min(...ns.map((n) => n.start))
    const low = ns.filter((n) => Math.abs(n.start - t) < EPS).reduce((a, b) => (b.midi < a.midi ? b : a))
    roots.push({ ...low, dur: round((bar + 1) * beatsPerBar - t) })
  }
  return [...roots, ...melody].sort((a, b) => a.start - b.start || a.midi - b.midi)
}

export interface Section {
  /** Buchstabe des Teils; Wiederholungen tragen den Buchstaben des ersten Vorkommens */
  letter: string
  /** Erster und letzter Takt (ab 1) */
  from: number
  to: number
  /** Startschlag im Stück */
  start: number
  end: number
  /** Wiederholung eines früheren Teils: Index des ersten Vorkommens */
  repeatOf: number | null
}

/** Takte pro Teil; kürzere Stücke bleiben ein Teil */
const SECTION_BARS = 8
const MIN_TAIL_BARS = 4

/** Stück in Teile zu acht Takten zerlegen; ein Rest unter vier Takten hängt am letzten Teil */
export function sectionsOf(notes: ScoreNote[], beatsPerBar: number): Section[] {
  const lastEnd = Math.max(0, ...notes.map((n) => n.start + n.dur))
  const bars = Math.max(1, Math.ceil(lastEnd / beatsPerBar - EPS))
  if (bars <= SECTION_BARS + MIN_TAIL_BARS) return [{ letter: 'A', from: 1, to: bars, start: 0, end: bars * beatsPerBar, repeatOf: null }]
  const bounds: [number, number][] = []
  for (let b = 0; b < bars; b += SECTION_BARS) bounds.push([b, Math.min(bars, b + SECTION_BARS)])
  const tail = bounds[bounds.length - 1]
  if (bounds.length > 1 && tail[1] - tail[0] < MIN_TAIL_BARS) {
    bounds.pop()
    bounds[bounds.length - 1][1] = tail[1]
  }
  const out: Section[] = []
  const seen = new Map<string, number>()
  let letters = 0
  for (const [b0, b1] of bounds) {
    const start = b0 * beatsPerBar
    const end = b1 * beatsPerBar
    const sig = JSON.stringify(sliceNotes(notes, start, end).map((n) => [n.midi, n.start, n.dur, n.hand]))
    const first = seen.get(sig)
    const letter = first === undefined ? String.fromCharCode(65 + letters++) : out[first].letter
    if (first === undefined) seen.set(sig, out.length)
    out.push({ letter, from: b0 + 1, to: b1, start, end, repeatOf: first ?? null })
  }
  return out
}

/** Töne, die im Abschnitt anschlagen, auf seinen Anfang verschoben und an seinem Ende gekappt */
export function sliceNotes(notes: ScoreNote[], start: number, end: number): ScoreNote[] {
  return notes
    .filter((n) => n.start >= start - EPS && n.start < end - EPS)
    .map((n) => ({ ...n, start: round(n.start - start), dur: round(Math.min(n.dur, end - n.start)) }))
}

/** Fassung: eigene Stücke kennen leicht und Original, eingebaute auch Mittel */
export type Version = 'easy' | 'medium' | 'full'

export interface PathStep {
  lesson: Lesson
  /** Name im Lernpfad ohne Stücktitel („Teil A, leicht“) */
  label: Localized
  version: Version
  /** null: das ganze Stück */
  section: Section | null
}

const both = (f: (m: typeof de) => string): Localized => ({ de: f(de), en: f(en) })

/** Kennung einer Lernfassung: own-<Stück>-<Teil oder all>-<Fassung> */
export const stepId = (pieceId: string, part: string, v: Version) => `own-${pieceId}-${part}-${v}`

/** Der Lernpfad eines Stücks: je Teil leicht und Original, zum Schluss das ganze Stück */
export function learningPath(piece: Piece): PathStep[] {
  const notes = pieceNotes(piece)
  const bpb = piece.beatsPerBar
  const sections = sectionsOf(notes, bpb)
  const base = { bpm: piece.bpm, beatsPerBar: bpb, beatUnit: piece.beatUnit, key: piece.key }
  const lessonOf = (id: string, title: Localized, goal: Localized, ns: ScoreNote[]): Lesson => ({ ...base, id, title, goal, notes: ns })
  const steps: PathStep[] = []

  if (sections.length > 1) {
    sections.forEach((s, i) => {
      if (s.repeatOf !== null) return
      const again = sections.filter((o) => o.repeatOf === i).map((o) => `${o.from}–${o.to}`)
      const repeat = (m: typeof de) => (again.length ? m.pieces.goalRepeat(again.join(', ')) : '')
      const part = sliceNotes(notes, s.start, s.end)
      const name = (m: typeof de) => `${piece.title} · ${m.pieces.section(s.letter)}`
      steps.push({
        version: 'easy',
        section: s,
        label: both((m) => `${m.pieces.section(s.letter)}, ${m.pieces.easy}`),
        lesson: lessonOf(
          stepId(piece.id, s.letter, 'easy'),
          both((m) => `${name(m)}, ${m.pieces.easy}`),
          both((m) => m.pieces.goalEasy(s.from, s.to) + repeat(m)),
          easyNotes(part, bpb),
        ),
      })
      steps.push({
        version: 'full',
        section: s,
        label: both((m) => m.pieces.section(s.letter)),
        lesson: lessonOf(stepId(piece.id, s.letter, 'full'), both(name), both((m) => m.pieces.goalFull(s.from, s.to) + repeat(m)), part),
      })
    })
  } else {
    steps.push({
      version: 'easy',
      section: null,
      label: both((m) => `${m.pieces.whole}, ${m.pieces.easy}`),
      lesson: lessonOf(
        stepId(piece.id, 'all', 'easy'),
        both((m) => `${piece.title} · ${m.pieces.easy}`),
        both((m) => m.pieces.goalWholeEasy),
        easyNotes(notes, bpb),
      ),
    })
  }
  steps.push({
    version: 'full',
    section: null,
    label: both((m) => m.pieces.whole),
    lesson: lessonOf(stepId(piece.id, 'all', 'full'), { de: piece.title, en: piece.title }, both((m) => m.pieces.goalWhole), notes),
  })
  return steps
}

/** Takte des ganzen Stücks */
export function barsOf(piece: Piece): number {
  const notes = pieceNotes(piece)
  const lastEnd = Math.max(0, ...notes.map((n) => n.start + n.dur))
  return Math.max(1, Math.ceil(lastEnd / piece.beatsPerBar - EPS))
}

/**
 * Titel aus dem Dateinamen, wie Downloadseiten sie liefern („hans-zimmer-cornfield-chase-21091-
 * nonstop2k.com.mid“): ohne Endung, Domains und Download-Nummern (ab fünf Ziffern, „BWV 846“ bleibt), Trennzeichen als Leerzeichen,
 * Wörter groß, wenn alles klein geschrieben war.
 */
export function titleFromFile(name: string): string {
  const words = name
    .replace(/\.(mid|midi|smf|kar)$/i, '')
    .replace(/(^|[\s_-])(www\.)?[a-z0-9]+\.(com|net|org|de|ru|io|info|co|uk|fr|it|es|pl|me)(?=$|[\s_-])/gi, ' ')
    .split(/[\s_-]+/)
    .filter((w) => w && !/^\d{5,}$/.test(w))
  const lower = words.every((w) => w === w.toLowerCase())
  const title = words.map((w) => (lower ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ')
  return title || 'MIDI'
}
