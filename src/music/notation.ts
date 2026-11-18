import type { Hand, Lesson, ScoreNote } from './lessons'

/**
 * Notenschrift aus den Lektionsdaten: Takte, Notenwerte, Pausen, Vorzeichen, Haltebögen.
 * Das ist unser eigenes Format, unabhängig vom Zeichner. Heute zeichnet VexFlow (SheetView),
 * später kann ein eigener SVG-Zeichner dasselbe Modell lesen.
 *
 * Grundlage sind Schläge wie in der App. Ein Schlag ist eine Viertel, bei `beatUnit: 8` eine
 * Achtel. Rechte Hand im Violin-, linke im Bassschlüssel; je Hand eine Stimme (das reicht für
 * alle Stücke heute: keine Hand spielt zwei Linien gleichzeitig).
 */

export type NoteValue = 'w' | 'h' | 'q' | '8' | '16'
export type Step = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'

export interface NotationKey {
  midi: number
  step: Step
  /** −1 = b, 0, +1 = Kreuz */
  alter: -1 | 0 | 1
  octave: number
  /** zu zeichnendes Vorzeichen (Tonart und frühere Vorzeichen im Takt berücksichtigt) */
  accidental?: '#' | 'b' | 'n'
  finger?: number
}

export interface NotationItem {
  hand: Hand
  /** Beginn in Schlägen (wie ScoreNote.start) */
  start: number
  beats: number
  value: NoteValue
  dots: 0 | 1
  rest: boolean
  /** Pause über den ganzen Takt (wird mittig als Ganze gezeichnet, egal welche Taktart) */
  fullBar?: boolean
  keys: NotationKey[]
  /** Haltebogen zum nächsten Element derselben Hand */
  tie?: boolean
  /** Fortsetzung eines gehaltenen Tons: kein neuer Anschlag */
  tied?: boolean
  /** Indizes in lesson.notes, die hier angeschlagen werden */
  noteIndex: number[]
}

export interface Measure {
  /** 0 = Auftakt, falls es einen gibt */
  number: number
  start: number
  end: number
  items: Record<Hand, NotationItem[]>
}

export interface Notation {
  /** z. B. [4, 4] oder [3, 8] */
  time: [number, number]
  /** Kreuze (positiv) oder Bs (negativ) */
  key: number
  measures: Measure[]
}

const EPS = 1e-6

/** Darstellbare Werte in Vierteln, größter zuerst */
const VALUES: { q: number; value: NoteValue; dots: 0 | 1 }[] = [
  { q: 4, value: 'w', dots: 0 },
  { q: 3, value: 'h', dots: 1 },
  { q: 2, value: 'h', dots: 0 },
  { q: 1.5, value: 'q', dots: 1 },
  { q: 1, value: 'q', dots: 0 },
  { q: 0.75, value: '8', dots: 1 },
  { q: 0.5, value: '8', dots: 0 },
  { q: 0.375, value: '16', dots: 1 },
  { q: 0.25, value: '16', dots: 0 },
]

/** Eine Länge in Vierteln in darstellbare Werte zerlegen (größte zuerst) */
export function splitValue(q: number): { q: number; value: NoteValue; dots: 0 | 1 }[] {
  const out: { q: number; value: NoteValue; dots: 0 | 1 }[] = []
  let rest = q
  while (rest > EPS) {
    const v = VALUES.find((x) => x.q <= rest + EPS)
    if (!v) break // kürzer als eine Sechzehntel: kommt in den Lektionen nicht vor
    out.push(v)
    rest -= v.q
  }
  return out
}

/** Deutsche Namen → Stammton; deutsches B ist Hes (Stammton B, erniedrigt) */
const LETTER: Record<string, Step> = { C: 'C', D: 'D', E: 'E', F: 'F', G: 'G', A: 'A', H: 'B', B: 'B' }
const STEP_PC: Record<Step, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const SHARP_NAMES: [Step, -1 | 0 | 1][] = [
  ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0],
]
const FLAT_NAMES: [Step, -1 | 0 | 1][] = [
  ['C', 0], ['D', -1], ['D', 0], ['E', -1], ['E', 0], ['F', 0], ['G', -1], ['G', 0], ['A', -1], ['A', 0], ['B', -1], ['B', 0],
]

/** Schreibweise eines Tons: aus den Daten („Dis“, „Es“, „H“), sonst nach Tonart (Kreuze oder Bs) */
export function spell(n: Pick<ScoreNote, 'midi' | 'spelling'>, key = 0): Omit<NotationKey, 'accidental' | 'finger'> {
  const m = n.spelling ? /^([A-H])(is|es|s)?$/.exec(n.spelling) : null
  if (m) {
    const step = LETTER[m[1]]
    let alter: -1 | 0 | 1 = m[1] === 'B' ? -1 : 0
    if (m[2] === 'is') alter = 1
    if (m[2] === 'es' || m[2] === 's') alter = -1
    // Oktave aus MIDI-Nummer und Stammton: bei His oder Ces liegt sie neben der des Klangs
    return { midi: n.midi, step, alter, octave: Math.floor((n.midi - alter - STEP_PC[step]) / 12) - 1 }
  }
  const [step, alter] = (key < 0 ? FLAT_NAMES : SHARP_NAMES)[((n.midi % 12) + 12) % 12]
  return { midi: n.midi, step, alter, octave: Math.floor((n.midi - alter - STEP_PC[step]) / 12) - 1 }
}

const SHARP_ORDER: Step[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
const FLAT_ORDER: Step[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F']

/** Welche Stammtöne die Tonart erhöht oder erniedrigt */
export function keyAlters(key: number): Partial<Record<Step, -1 | 1>> {
  const out: Partial<Record<Step, -1 | 1>> = {}
  if (key > 0) SHARP_ORDER.slice(0, key).forEach((s) => (out[s] = 1))
  if (key < 0) FLAT_ORDER.slice(0, -key).forEach((s) => (out[s] = -1))
  return out
}

/** Taktgrenzen in Schlägen; beim Auftakt beginnt der erste (kurze) Takt erst kurz vor dem ersten vollen */
function measureBounds(lesson: Lesson, total: number): [number, number][] {
  const bpb = lesson.beatsPerBar
  const out: [number, number][] = []
  let s = 0
  if (lesson.pickup) {
    out.push([bpb - lesson.pickup, bpb])
    s = bpb
  }
  while (s < total - EPS) {
    out.push([s, s + bpb])
    s += bpb
  }
  return out
}

export function notationOf(lesson: Lesson): Notation {
  const unit = lesson.beatUnit ?? 4
  const key = lesson.key ?? 0
  const qPerBeat = 4 / unit
  const total = Math.max(0, ...lesson.notes.map((n) => n.start + n.dur))
  const bounds = measureBounds(lesson, total)
  const fromKey = keyAlters(key)

  // Anschläge je Hand: gleiche Hand, gleicher Beginn = ein Akkord
  type Group = { hand: Hand; start: number; dur: number; idx: number[] }
  const groups: Group[] = []
  lesson.notes.forEach((n, i) => {
    const g = groups.find((x) => x.hand === n.hand && Math.abs(x.start - n.start) < EPS)
    if (g) {
      g.idx.push(i)
      g.dur = Math.max(g.dur, n.dur)
    } else groups.push({ hand: n.hand, start: n.start, dur: n.dur, idx: [i] })
  })

  const measures: Measure[] = bounds.map(([start, end], i) => ({
    number: lesson.pickup ? i : i + 1,
    start,
    end,
    items: { L: [], R: [] },
  }))

  for (const hand of ['R', 'L'] as const) {
    const hs = groups.filter((g) => g.hand === hand).sort((a, b) => a.start - b.start)
    for (const m of measures) {
      const items: NotationItem[] = []
      // Vorzeichen gelten bis zum Taktende, danach wieder die Tonart
      const inEffect = new Map<string, number>()
      const pushRest = (from: number, to: number) => {
        if (to - from < EPS) return
        if (Math.abs(from - m.start) < EPS && Math.abs(to - m.end) < EPS) {
          items.push({ hand, start: from, beats: to - from, value: 'w', dots: 0, rest: true, fullBar: true, keys: [], noteIndex: [] })
          return
        }
        let t = from
        for (const v of splitValue((to - from) * qPerBeat)) {
          items.push({ hand, start: t, beats: v.q / qPerBeat, value: v.value, dots: v.dots, rest: true, keys: [], noteIndex: [] })
          t += v.q / qPerBeat
        }
      }
      let t = m.start
      for (const g of hs) {
        const gEnd = g.start + g.dur
        // Teil des Anschlags in diesem Takt (lange Töne laufen mit Haltebogen in den nächsten)
        const from = Math.max(g.start, m.start)
        const to = Math.min(gEnd, m.end)
        if (to - from < EPS) continue
        pushRest(t, from)
        const attack = Math.abs(from - g.start) < EPS
        const keys = g.idx
          .map((i) => lesson.notes[i])
          .sort((a, b) => a.midi - b.midi)
          .map((n): NotationKey => {
            const sp = spell(n, key)
            const id = `${sp.step}${sp.octave}`
            const now = inEffect.get(id) ?? fromKey[sp.step] ?? 0
            let accidental: NotationKey['accidental']
            if (sp.alter !== now) {
              accidental = sp.alter === 1 ? '#' : sp.alter === -1 ? 'b' : 'n'
              inEffect.set(id, sp.alter)
            }
            // Fortsetzungen hinter einem Haltebogen zeigen kein Vorzeichen und keinen Finger
            return attack ? { ...sp, accidental, finger: n.finger } : sp
          })
        const parts = splitValue((to - from) * qPerBeat)
        let pt = from
        parts.forEach((v, k) => {
          const last = k === parts.length - 1
          items.push({
            hand,
            start: pt,
            beats: v.q / qPerBeat,
            value: v.value,
            dots: v.dots,
            rest: false,
            keys: k === 0 ? keys : keys.map(({ accidental: _, finger: __, ...rest }) => rest),
            tie: !last || to < gEnd - EPS,
            tied: k > 0 || !attack,
            noteIndex: k === 0 && attack ? [...g.idx] : [],
          })
          pt += v.q / qPerBeat
        })
        t = to
      }
      pushRest(t, m.end)
      m.items[hand] = items
    }
  }
  return { time: [lesson.beatsPerBar, unit], key, measures }
}
