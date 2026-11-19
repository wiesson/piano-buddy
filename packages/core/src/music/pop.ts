import { de } from '../i18n/de'
import { en } from '../i18n/en'
import type { Localized } from '../i18n/localized'
import { elementsOf, handChordElements, newElements, type ElementId } from './elements'
import type { Hand, Lesson, ScoreNote } from './lessons'

/**
 * Pop-Pfad „Party-Pianist“ (STU-1271): Übungen, die der Code selbst erzeugt, ohne KI. Jede Übung
 * ist eine Zelle in einem Raster aus fünf Achsen:
 *
 * - Akkordfolge: I–V–vi–IV, vi–IV–I–V, I–vi–IV–V (die Folgen hinter unzähligen Hits)
 * - Tonart: C, G, F, D
 * - Begleitmuster: Ganze, Viertel, Achtel, gebrochen (Ballade), Offbeat, Oktav-Bass
 * - Griffe: Grundstellung oder nächste Lage (Umkehrungen, die Hand bleibt liegen)
 * - Rolle: zum Singen begleiten (links Bass, rechts Akkord) oder links begleiten, rechts Melodie
 *
 * Die Kennung kodiert das Rezept (`pop-1564-c-ganze-grund-sing`); es gibt keine Tabelle,
 * Versuche laufen über das normale Protokoll. Was als Nächstes dran ist, ergibt sich aus den
 * Nachbarzellen des Gemeisterten (`frontier`), geordnet nach dem Element-Modell: Pro Schritt
 * ändert sich genau eine Achse, und es kommt möglichst nur ein neues Element dazu.
 *
 * Rechte: Akkordfolgen und Begleitmuster sind nicht geschützt. Die Melodie der Rolle „Melodie“
 * ist erzeugt (Akkordtöne in der Fünftonlage der Tonart), keine Hook eines Songs.
 */

export type ProgId = '1564' | '6415' | '1645'
export type KeyId = 'c' | 'g' | 'f' | 'd'
export type PatternId = 'ganze' | 'viertel' | 'achtel' | 'ballade' | 'offbeat' | 'oktave'
export type VoicingId = 'grund' | 'nah'
export type RoleId = 'sing' | 'melodie'

export interface Cell {
  prog: ProgId
  key: KeyId
  pattern: PatternId
  voicing: VoicingId
  role: RoleId
}

export const AXES = ['prog', 'key', 'pattern', 'voicing', 'role'] as const
export type Axis = (typeof AXES)[number]

/** Stufen der Akkorde (0 = I) */
export const PROGRESSIONS: Record<ProgId, { degrees: number[]; label: string }> = {
  '1564': { degrees: [0, 4, 5, 3], label: 'I–V–vi–IV' },
  '6415': { degrees: [5, 3, 0, 4], label: 'vi–IV–I–V' },
  '1645': { degrees: [0, 5, 3, 4], label: 'I–vi–IV–V' },
}

/**
 * Tonarten: Grundton als Tonklasse, Stammton-Index (C = 0 … H = 6) für die Schreibweise, Lage der
 * Melodie (Daumen auf dem Grundton nah am mittleren C) und Mitte der Akkorde rechts beim Begleiten
 * (in G um G4, sonst läge die rechte Hand auf den Tasten des Basses).
 */
export const KEYS: Record<KeyId, { pc: number; letter: number; home: number; chords: number; sig: number }> = {
  c: { pc: 0, letter: 0, home: 60, chords: 60, sig: 0 },
  g: { pc: 7, letter: 4, home: 55, chords: 67, sig: 1 },
  f: { pc: 5, letter: 3, home: 65, chords: 65, sig: -1 },
  d: { pc: 2, letter: 1, home: 62, chords: 62, sig: 2 },
}

/**
 * Alle Muster, die zur Wahl stehen, vom leichtesten zum schwersten: gebrochen (Einzeltöne über
 * gehaltenem Bass) ist leichter als Akkorde in Achteln gegen Viertel im Bass
 */
export const PATTERNS: readonly PatternId[] = ['ganze', 'viertel', 'ballade', 'achtel', 'offbeat', 'oktave']
/** Vorauswahl, bis Arne am Klavier gewählt hat; der Oktav-Bass bleibt freiwillig */
export const DEFAULT_PATTERNS: readonly PatternId[] = ['ganze', 'viertel', 'ballade', 'achtel', 'offbeat']

const ORDER: { [A in Axis]: readonly Cell[A][] } = {
  prog: ['1564', '6415', '1645'],
  key: ['c', 'g', 'f', 'd'],
  pattern: PATTERNS,
  voicing: ['grund', 'nah'],
  role: ['sing', 'melodie'],
}

/** Werte einer Achse in Lernreihenfolge; bei den Mustern nur die gewählten */
export const axisValues = <A extends Axis>(a: A, patterns: readonly PatternId[] = DEFAULT_PATTERNS): readonly Cell[A][] =>
  (a === 'pattern' ? PATTERNS.filter((p) => patterns.includes(p)) : ORDER[a]) as readonly Cell[A][]

/** Den Oktav-Bass gibt es nur beim Begleiten: in der Rolle Melodie spielte links sonst keine Akkorde */
export const validCell = (c: Cell) => !(c.pattern === 'oktave' && c.role === 'melodie')

export const cellId = (c: Cell) => `pop-${c.prog}-${c.key}-${c.pattern}-${c.voicing}-${c.role}`

export function parseCell(id: string): Cell | null {
  const m = /^pop-(\d{4})-([a-z])-([a-z]+)-([a-z]+)-([a-z]+)$/.exec(id)
  if (!m) return null
  const c = { prog: m[1], key: m[2], pattern: m[3], voicing: m[4], role: m[5] } as Cell
  return AXES.every((a) => (ORDER[a] as readonly string[]).includes(c[a])) && validCell(c) ? c : null
}

export const startCell = (patterns: readonly PatternId[] = DEFAULT_PATTERNS): Cell => ({
  prog: '1564',
  key: 'c',
  pattern: axisValues('pattern', patterns)[0] ?? 'ganze',
  voicing: 'grund',
  role: 'sing',
})

// ---------------------------------------------------------------------------------------------
// Töne

const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'H']
const NATURAL = [0, 2, 4, 5, 7, 9, 11]
const BAR = 4
const BARS = 9

/** Ton der Tonleiter: Stufe (beliebig, auch negativ oder über 7) ab dem Grundton in `base` */
const degreeMidi = (base: number, deg: number) => base + 12 * Math.floor(deg / 7) + MAJOR[((deg % 7) + 7) % 7]

/** Deutsche Schreibweise eines leitereigenen Tons: Fis, Cis, B (= Hes) … */
function spell(key: KeyId, midi: number): string {
  const k = KEYS[key]
  const deg = MAJOR.indexOf((((midi - k.pc) % 12) + 12) % 12)
  const letter = (k.letter + deg) % 7
  const diff = ((((midi % 12) - NATURAL[letter]) % 12) + 18) % 12 - 6
  const name = LETTERS[letter]
  if (diff === 0) return name
  if (diff > 0) return `${name}is`
  if (name === 'H') return 'B'
  return name === 'E' || name === 'A' ? `${name}s` : `${name}es`
}

/** Tonklassen eines Dreiklangs auf einer Stufe: Grundton, Terz, Quinte */
const triadPcs = (key: KeyId, deg: number) => [0, 2, 4].map((i) => (KEYS[key].pc + MAJOR[(deg + i) % 7]) % 12)

type Voicing = number[]

/** Grundstellung, der Grundton so nah wie möglich an `center` (bei Gleichstand tiefer), ganz unter `ceiling` */
function rootPosition(key: KeyId, deg: number, center: number, ceiling = Infinity): Voicing {
  const [r, t, f] = triadPcs(key, deg)
  let root = center - ((((center - r) % 12) + 12) % 12)
  if (center - root > 6) root += 12
  const up = (pc: number, from: number) => from + ((((pc - from) % 12) + 12) % 12)
  const v = [root, up(t, root), up(f, root)]
  return v[2] >= ceiling ? v.map((x) => x - 12) : v
}

/** Alle engen Lagen eines Dreiklangs (Grundstellung und Umkehrungen) mit dem tiefsten Ton in [lo, hi] */
function closeVoicings(key: KeyId, deg: number, lo: number, hi: number): Voicing[] {
  const pcs = triadPcs(key, deg)
  const out: Voicing[] = []
  for (let bottom = lo; bottom <= hi; bottom++) {
    const inv = pcs.indexOf(((bottom % 12) + 12) % 12)
    if (inv < 0) continue
    const v = [bottom]
    for (let i = 1; i < 3; i++) {
      const pc = pcs[(inv + i) % 3]
      const prev = v[v.length - 1]
      v.push(prev + ((((pc - prev) % 12) + 12) % 12 || 12))
    }
    out.push(v)
  }
  return out
}

const moveCost = (a: Voicing, b: Voicing) => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0)

/** Nächste Lage: von `prev` aus der Griff mit der kleinsten Bewegung aller drei Finger, ganz unter `ceiling` */
export function nearestVoicing(key: KeyId, deg: number, prev: Voicing, ceiling = Infinity): Voicing {
  const cands = closeVoicings(key, deg, prev[0] - 7, prev[0] + 7).filter((v) => v[2] < ceiling)
  return cands.reduce((best, v) => (moveCost(v, prev) < moveCost(best, prev) ? v : best))
}

/**
 * Griffe der Folge: Grundstellung um `center`, oder ab der Tonika in Grundstellung je die nächste
 * Lage. `ceiling`: Akkorde links bleiben unter der Melodie. Mit `rootEnd` schließt die Folge in
 * Grundstellung (ohne eigenen Bass klingt der Schluss sonst unentschieden).
 */
function voicings(c: Cell, degrees: number[], center: number, ceiling = Infinity, rootEnd = false): Voicing[] {
  const root = (d: number) => rootPosition(c.key, d, center, ceiling)
  if (c.voicing === 'grund') return degrees.map(root)
  const out: Voicing[] = []
  let prev = root(0)
  degrees.forEach((d, i) => {
    if (rootEnd && i === degrees.length - 1) prev = root(d)
    else prev = d === 0 && out.length === 0 ? prev : nearestVoicing(c.key, d, prev, ceiling)
    out.push(prev)
  })
  return out
}

/** Finger eines engen Dreiklangs (tiefster Ton zuerst): rechts 1-2-5 mit der Quarte oben, links 5-2-1 mit der Quarte unten */
function chordFingers(v: Voicing, hand: Hand): number[] {
  const fourthBelow = v[1] - v[0] === 5
  const fourthAbove = v[2] - v[1] === 5
  if (hand === 'R') return fourthAbove ? [1, 2, 5] : [1, 3, 5]
  return fourthBelow ? [5, 2, 1] : [5, 3, 1]
}

/** Lage des Basses: kleiner Finger auf der IV. Stufe, Daumen auf der I. darüber (wie in „Vier Akkorde“) */
function bassOf(key: KeyId, deg: number): { midi: number; finger: number } {
  const k = KEYS[key]
  let iv = degreeMidi(k.pc, 3)
  while (iv < 41) iv += 12
  while (iv > 52) iv -= 12
  // Stufen IV, V, vi, vii, I liegen unter den Fingern 5 4 3 2 1
  const rel = (((deg - 3) % 7) + 7) % 7
  return { midi: degreeMidi(iv - MAJOR[3], 3 + rel), finger: 5 - rel }
}

interface Hit {
  midis: number[]
  fingers: number[]
  start: number
  dur: number
}

/** Akkordhand im Muster, ein Takt ab `t` */
function chordFigure(p: PatternId, v: Voicing, f: number[], t: number): Hit[] {
  const block = (start: number, dur: number): Hit => ({ midis: v, fingers: f, start: t + start, dur })
  const one = (i: number, start: number): Hit => ({ midis: [v[i]], fingers: [f[i]], start: t + start, dur: 0.5 })
  switch (p) {
    case 'ganze':
      return [block(0, 4)]
    case 'viertel':
      return [0, 1, 2, 3].map((i) => block(i, 1))
    case 'achtel':
      return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => block(i / 2, 0.5))
    case 'ballade':
      return [0, 1, 2, 1, 0, 1, 2, 1].map((n, i) => one(n, i / 2))
    case 'offbeat':
      return [0, 1, 2, 3].map((i) => block(i + 0.5, 0.5))
    case 'oktave':
      return [block(0, 2), block(2, 2)]
  }
}

/** Basshand im Muster (Rolle „Begleiten“), ein Takt ab `t` */
function bassFigure(p: PatternId, b: { midi: number; finger: number }, t: number): Hit[] {
  const n = (start: number, dur: number, up = false): Hit => ({
    midis: [b.midi + (up ? 12 : 0)],
    fingers: [up ? 1 : b.finger],
    start: t + start,
    dur,
  })
  switch (p) {
    case 'achtel':
      return [0, 1, 2, 3].map((i) => n(i, 1))
    case 'offbeat':
      return [n(0, 2), n(2, 2)]
    case 'oktave':
      // Eine Oktave tiefer als der übrige Bass, damit der Daumen nicht in die rechte Hand greift:
      // Grundton mit dem kleinen Finger, Oktave mit dem Daumen
      return [0, 1, 2, 3].map((i) => ({ ...n(i, 1, i % 2 === 1), midis: [b.midi - 12 + (i % 2) * 12], fingers: [i % 2 === 1 ? 1 : 5] }))
    default:
      return [n(0, 4)]
  }
}

/**
 * Melodien für die Rolle „Melodie“, eigene Erfindung je Folge (keine Hook eines Songs): acht
 * Takte als Tonleiterstufen in der Fünftonlage der Tonart (0 = Grundton = Daumen), [Stufe, Dauer].
 * Jeder Takt beginnt mit einem Akkordton; geschlossen wird auf dem Grundton.
 */
const MELODIES: Record<ProgId, [number, number][][]> = {
  '1564': [
    [[2, 1], [2, 1], [4, 2]],
    [[1, 1], [2, 1], [1, 2]],
    [[2, 1], [1, 1], [0, 2]],
    [[0, 1], [1, 1], [3, 2]],
    [[4, 1], [3, 1], [2, 2]],
    [[1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 2]],
    [[3, 1], [2, 1], [3, 2]],
  ],
  '6415': [
    [[2, 2], [1, 1], [0, 1]],
    [[3, 1], [2, 1], [3, 1], [0, 1]],
    [[0, 2], [2, 2]],
    [[4, 2], [3, 1], [1, 1]],
    [[0, 1], [1, 1], [2, 2]],
    [[3, 1], [2, 1], [1, 1], [0, 1]],
    [[2, 2], [4, 2]],
    [[4, 1], [3, 1], [1, 2]],
  ],
  '1645': [
    [[0, 1], [2, 1], [4, 2]],
    [[2, 2], [0, 2]],
    [[0, 1], [1, 1], [0, 1], [3, 1]],
    [[1, 1], [2, 1], [1, 2]],
    [[2, 1], [2, 1], [4, 2]],
    [[2, 1], [1, 1], [0, 2]],
    [[3, 2], [2, 1], [1, 1]],
    [[1, 2], [2, 1], [1, 1]],
  ],
}

/** Die Melodie in der Lage der Tonart, Finger = Stufe + 1, zum Schluss der Grundton */
function melody(c: Cell): Hit[] {
  const home = KEYS[c.key].home
  const hit = (deg: number, start: number, dur: number): Hit => ({ midis: [degreeMidi(home, deg)], fingers: [deg + 1], start, dur })
  const out: Hit[] = []
  MELODIES[c.prog].forEach((bar, i) => {
    let t = i * BAR
    for (const [deg, dur] of bar) {
      out.push(hit(deg, t, dur))
      t += dur
    }
  })
  out.push(hit(0, 8 * BAR, BAR))
  return out
}

const toNotes = (hits: Hit[], hand: Hand, key: KeyId): ScoreNote[] =>
  hits.flatMap((h) => h.midis.map((midi, i) => ({ midi, start: h.start, dur: h.dur, hand, finger: h.fingers[i], spelling: spell(key, midi) })))

const both = (f: (m: typeof de) => string): Localized => ({ de: f(de), en: f(en) })

/** Die Übung einer Zelle: Folge zweimal, dann der erste Akkord als Schluss, 4/4 */
export function popLesson(c: Cell): Lesson {
  const prog = PROGRESSIONS[c.prog]
  const degrees = prog.degrees
  const all = [...degrees, ...degrees, degrees[0]]
  const { home, chords } = KEYS[c.key]
  const sing = c.role === 'sing'
  const chordHand: Hand = sing ? 'R' : 'L'
  // Begleiten: Akkorde rechts um die Akkord-Mitte; Melodie: Akkorde links, ganz unter dem Grundton der Melodie
  const vs = sing ? voicings(c, all, chords) : voicings(c, all, home - 12, home, true)
  const notes: ScoreNote[] = []
  const lastBar = (BARS - 1) * BAR
  all.forEach((d, i) => {
    const t = i * BAR
    const final = t === lastBar
    const fingers = chordFingers(vs[i], chordHand)
    notes.push(...toNotes(chordFigure(final ? 'ganze' : c.pattern, vs[i], fingers, t), chordHand, c.key))
    if (sing) {
      const bass = bassFigure(final ? 'ganze' : c.pattern, bassOf(c.key, d), t)
      // Nach dem Oktav-Bass endet auch der Schluss unten, mit dem kleinen Finger
      if (final && c.pattern === 'oktave') bass.forEach((h) => (h.midis = h.midis.map((m) => m - 12), (h.fingers = [5])))
      notes.push(...toNotes(bass, 'L', c.key))
    }
  })
  if (c.role === 'melodie') notes.push(...toNotes(melody(c), 'R', c.key))
  notes.sort((a, b) => a.start - b.start || a.midi - b.midi)
  return {
    id: cellId(c),
    title: both((m) => m.pop.title(prog.label, m.pop.keys[c.key], m.pop.patterns[c.pattern].name, m.pop.voicings[c.voicing], m.pop.roles[c.role])),
    goal: both((m) =>
      [m.pop.roleGoal[c.role], m.pop.patterns[c.pattern].goal, sing ? m.pop.patterns[c.pattern].bass : '', m.pop.voicingGoal[c.voicing]]
        .filter(Boolean)
        .join(' '),
    ),
    bpm: 80,
    beatsPerBar: BAR,
    key: KEYS[c.key].sig,
    notes,
  }
}

// ---------------------------------------------------------------------------------------------
// Spielbarkeit

/**
 * Prüft eine Übung, wie eine Lehrerin es täte: jeder Takt voll, kein Griff weiter als eine Oktave,
 * jeder Ton gefingert, kein Finger doppelt, Finger in Tonhöhen-Reihenfolge. Leer heißt spielbar.
 */
export function playabilityProblems(l: Lesson): string[] {
  const out: string[] = []
  const bars = Math.round(Math.max(...l.notes.map((n) => n.start + n.dur)) / l.beatsPerBar)
  for (const hand of ['L', 'R'] as const) {
    const ns = l.notes.filter((n) => n.hand === hand)
    if (!ns.length) continue
    // Taktsumme: Was die Hand pro Takt spielt (Töne und Pausen dazwischen) füllt genau den Takt
    for (let b = 0; b < bars; b++) {
      const inBar = ns.filter((n) => n.start >= b * l.beatsPerBar - 1e-6 && n.start < (b + 1) * l.beatsPerBar - 1e-6)
      const end = Math.max(...inBar.map((n) => n.start + n.dur))
      if (inBar.length && end > (b + 1) * l.beatsPerBar + 1e-6) out.push(`${hand} Takt ${b + 1}: Ton über den Taktstrich`)
    }
    const groups = new Map<number, ScoreNote[]>()
    for (const n of ns) groups.set(n.start, [...(groups.get(n.start) ?? []), n])
    for (const [t, g] of groups) {
      const span = Math.max(...g.map((n) => n.midi)) - Math.min(...g.map((n) => n.midi))
      if (span > 12) out.push(`${hand} @${t}: Griff ${span} Halbtöne`)
      if (g.some((n) => !n.finger)) out.push(`${hand} @${t}: ohne Fingersatz`)
      if (new Set(g.map((n) => n.finger)).size < g.length) out.push(`${hand} @${t}: Finger doppelt`)
      const byPitch = [...g].sort((a, b) => a.midi - b.midi).map((n) => n.finger!)
      const ordered = byPitch.every((f, i) => i === 0 || (hand === 'R' ? f > byPitch[i - 1] : f < byPitch[i - 1]))
      if (!ordered) out.push(`${hand} @${t}: Finger nicht in Tonhöhen-Reihenfolge`)
    }
  }
  // Beide Hände nie gleichzeitig auf derselben Taste
  const L = l.notes.filter((n) => n.hand === 'L')
  for (const r of l.notes.filter((n) => n.hand === 'R'))
    for (const x of L)
      if (x.midi === r.midi && x.start < r.start + r.dur - 1e-6 && r.start < x.start + x.dur - 1e-6)
        out.push(`@${Math.min(x.start, r.start)}: beide Hände auf ${x.midi}`)
  const lastEnd = Math.max(...l.notes.map((n) => n.start + n.dur))
  if (Math.abs(lastEnd - BARS * BAR) > 1e-6) out.push(`Länge ${lastEnd} statt ${BARS * BAR} Schlägen`)
  return out
}

/** Alle Zellen mit den gewählten Mustern */
export function allCells(patterns: readonly PatternId[] = DEFAULT_PATTERNS): Cell[] {
  const out: Cell[] = []
  for (const prog of axisValues('prog'))
    for (const key of axisValues('key'))
      for (const pattern of axisValues('pattern', patterns))
        for (const voicing of axisValues('voicing'))
          for (const role of axisValues('role')) if (validCell({ prog, key, pattern, voicing, role })) out.push({ prog, key, pattern, voicing, role })
  return out
}

// ---------------------------------------------------------------------------------------------
// Stufen: Nachbarn und Frontier

/** In wie vielen Achsen sich zwei Zellen unterscheiden */
export const axisDistance = (a: Cell, b: Cell) => AXES.filter((x) => a[x] !== b[x]).length

/** Die Nachbarn einer Zelle: in genau einer Achse eine Stufe weiter */
export function neighbours(c: Cell, patterns: readonly PatternId[] = DEFAULT_PATTERNS): { axis: Axis; cell: Cell }[] {
  const out: { axis: Axis; cell: Cell }[] = []
  for (const a of AXES) {
    const vals = axisValues(a, patterns) as readonly string[]
    const i = vals.indexOf(c[a])
    const cell = { ...c, [a]: vals[i + 1] } as Cell
    if (i >= 0 && i + 1 < vals.length && validCell(cell)) out.push({ axis: a, cell })
  }
  return out
}

/** Reihenfolge, in der Achsen bei gleich vielen neuen Elementen drankommen */
const AXIS_PRIORITY: readonly Axis[] = ['voicing', 'pattern', 'prog', 'role', 'key']

export interface Next {
  cell: Cell
  /** Achse, in der sich die Zelle vom Gemeisterten unterscheidet (null: Einstieg) */
  axis: Axis | null
  /** Was gegenüber dem Bekannten neu ist */
  fresh: ElementId[]
}

/**
 * Die nächsten Zellen: Nachbarn des Gemeisterten, je Achse die leichteste (nach neuen Elementen),
 * höchstens vier. Ohne Gemeistertes: der Einstieg und seine leichtesten Nachbarn.
 */
export function frontier(mastered: Cell[], known: Iterable<ElementId>, patterns: readonly PatternId[] = DEFAULT_PATTERNS): Next[] {
  const k = new Set(known)
  const done = new Set(mastered.map(cellId))
  const start = startCell(patterns)
  const seeds = mastered.length ? mastered : [start]
  const freshOf = (c: Cell) => {
    const l = popLesson(c)
    return [...newElements(k, l), ...handChordElements(l).filter((e) => !k.has(e))]
  }
  const best = new Map<Axis, Next>()
  for (const m of seeds)
    for (const { axis, cell } of neighbours(m, patterns)) {
      if (done.has(cellId(cell))) continue
      const n: Next = { cell, axis, fresh: freshOf(cell) }
      const cur = best.get(axis)
      if (!cur || n.fresh.length < cur.fresh.length) best.set(axis, n)
    }
  const ranked = [...best.values()].sort(
    (a, b) => a.fresh.length - b.fresh.length || AXIS_PRIORITY.indexOf(a.axis!) - AXIS_PRIORITY.indexOf(b.axis!),
  )
  if (!mastered.length) return [{ cell: start, axis: null, fresh: freshOf(start) }, ...ranked].slice(0, 3)
  return ranked.slice(0, 4)
}

/** Elemente, die eine Zelle verlangt (für die Anzeige) */
export const cellElements = (c: Cell) => elementsOf(popLesson(c))
