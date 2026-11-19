import { describe, expect, it } from 'vitest'
import { demandsOf, elementsOf } from './elements'
import {
  DEFAULT_PATTERNS,
  PATTERNS,
  allCells,
  axisDistance,
  cellId,
  frontier,
  nearestVoicing,
  neighbours,
  parseCell,
  playabilityProblems,
  popLesson,
  startCell,
  type Cell,
} from './pop'

const c = (over: Partial<Cell> = {}): Cell => ({ ...startCell(), ...over })
const chordsOf = (cell: Cell, hand: 'L' | 'R') => {
  const ns = popLesson(cell).notes.filter((n) => n.hand === hand)
  const byStart = new Map<number, number[]>()
  for (const n of ns) byStart.set(n.start, [...(byStart.get(n.start) ?? []), n.midi].sort((a, b) => a - b))
  return [...byStart.values()]
}

describe('Pop-Pfad: Erzeugung', () => {
  it('genug Zellen: 3 Folgen × 4 Tonarten × 3+ Muster × 2 Griffe × 2 Rollen, jede spielbar', () => {
    const cells = allCells(PATTERNS)
    // Oktav-Bass nur beim Begleiten: in der Rolle Melodie hätte links keine Akkorde
    expect(cells.length).toBe(3 * 4 * (PATTERNS.length * 2 * 2 - 2))
    expect(cells.some((x) => x.pattern === 'oktave' && x.role === 'melodie')).toBe(false)
    const bad = cells.flatMap((x) => playabilityProblems(popLesson(x)).map((p) => `${cellId(x)}: ${p}`))
    expect(bad).toEqual([])
  })

  it('die Prüfung erkennt, wenn beide Hände zugleich dieselbe Taste spielen', () => {
    const l = popLesson(c())
    const clash = { ...l, notes: [...l.notes, { midi: 60, start: 0, dur: 4, hand: 'L' as const, finger: 1 }] }
    expect(playabilityProblems(clash).some((p) => p.includes('beide Hände'))).toBe(true)
  })

  it('Rolle Melodie: Akkorde links bleiben unter dem Grundton der Melodie', () => {
    for (const x of allCells(PATTERNS).filter((y) => y.role === 'melodie')) {
      const l = popLesson(x)
      const top = Math.max(...l.notes.filter((n) => n.hand === 'L').map((n) => n.midi))
      const low = Math.min(...l.notes.filter((n) => n.hand === 'R').map((n) => n.midi))
      expect(top, cellId(x)).toBeLessThan(low)
    }
  })

  it('Kennung hin und zurück, Unsinn wird abgelehnt', () => {
    for (const x of allCells(PATTERNS)) expect(parseCell(cellId(x))).toEqual(x)
    expect(parseCell('pop-1564-x-ganze-grund-sing')).toBeNull()
    expect(parseCell('kanon')).toBeNull()
    expect(parseCell('pop-1564-c-oktave-grund-melodie')).toBeNull()
  })

  it('Taktsumme: neun Takte 4/4, die Folge zweimal und der Schlussakkord', () => {
    for (const x of allCells(PATTERNS)) {
      const l = popLesson(x)
      expect(Math.max(...l.notes.map((n) => n.start + n.dur))).toBe(36)
      expect(demandsOf(l).bars).toBe(9)
    }
  })

  it('I–V–vi–IV in C, Grundstellung: C, G, a, F', () => {
    const r = chordsOf(c(), 'R')
    expect(r.slice(0, 4)).toEqual([
      [60, 64, 67],
      [55, 59, 62],
      [57, 60, 64],
      [65, 69, 72],
    ])
    // links der Grundton in der Lage F2–C3, wie in „Vier Akkorde“
    expect(chordsOf(c(), 'L').slice(0, 4)).toEqual([[48], [43], [45], [41]])
  })

  it('nächste Lage: jeder Griff ist der mit der kleinsten Bewegung, die Hand bleibt um die Tonika', () => {
    const r = chordsOf(c({ voicing: 'nah' }), 'R')
    // C (C E G) → G (H D G) → a (C E A) → F (C F A): wie die Pop-Lehrer es zeigen
    expect(r.slice(0, 4)).toEqual([
      [60, 64, 67],
      [59, 62, 67],
      [60, 64, 69],
      [60, 65, 69],
    ])
    // Stimmführung: kein Ton springt weiter als eine Terz
    for (let i = 1; i < r.length; i++) r[i].forEach((m, j) => expect(Math.abs(m - r[i - 1][j])).toBeLessThanOrEqual(4))
  })

  it('nächste Lage ist wirklich die nächste: kein anderer enger Griff bewegt die Finger weniger', () => {
    const prev = [60, 64, 67]
    const best = nearestVoicing('c', 4, prev)
    const cost = (v: number[]) => v.reduce((s, x, i) => s + Math.abs(x - prev[i]), 0)
    // Alle Lagen von G-Dur zwischen G3 und G4
    const all = [
      [55, 59, 62],
      [59, 62, 67],
      [62, 67, 71],
      [67, 71, 74],
    ]
    expect(cost(best)).toBe(Math.min(...all.map(cost)))
  })

  it('Tonart G: Fis in D-Dur, als Fis geschrieben; Tonart F: B statt Ais', () => {
    const g = popLesson(c({ key: 'g' })).notes.filter((n) => n.midi % 12 === 6)
    expect(g.length).toBeGreaterThan(0)
    expect(new Set(g.map((n) => n.spelling))).toEqual(new Set(['Fis']))
    const f = popLesson(c({ key: 'f' })).notes.filter((n) => n.midi % 12 === 10)
    expect(new Set(f.map((n) => n.spelling))).toEqual(new Set(['B']))
  })

  it('Rolle Melodie: rechts eine Stimme in der Fünftonlage der Tonart, links die Akkorde', () => {
    const l = popLesson(c({ role: 'melodie' }))
    const r = l.notes.filter((n) => n.hand === 'R')
    expect(Math.max(...r.map((n) => n.midi)) - Math.min(...r.map((n) => n.midi))).toBeLessThanOrEqual(7)
    expect(demandsOf(l).hands.R!.maxChord).toBe(1)
    expect(demandsOf(l).hands.L!.maxChord).toBe(3)
  })

  it('Melodie: in jeder Folge und Tonart beginnt jeder Takt mit einem Ton des Akkords, den links spielt', () => {
    for (const x of allCells(PATTERNS).filter((y) => y.role === 'melodie' && y.pattern === 'ganze' && y.voicing === 'grund')) {
      const l = popLesson(x)
      for (let bar = 0; bar < 9; bar++) {
        const first = l.notes.find((n) => n.hand === 'R' && n.start === bar * 4)!
        const chord = l.notes.filter((n) => n.hand === 'L' && n.start === bar * 4).map((n) => n.midi % 12)
        expect(chord, `${cellId(x)} Takt ${bar + 1}`).toContain(first.midi % 12)
      }
    }
  })

  it('die Muster verlangen, was ihr Name sagt (Element-Modell)', () => {
    expect(elementsOf(popLesson(c({ pattern: 'ganze' })))).not.toContain('eighths')
    expect(elementsOf(popLesson(c({ pattern: 'achtel' })))).toContain('eighths')
    expect(elementsOf(popLesson(c({ pattern: 'offbeat' })))).toContain('offbeat')
    expect(elementsOf(popLesson(c({ pattern: 'oktave' })))).toContain('wide-range')
    expect(elementsOf(popLesson(c({ key: 'd' })))).toContain('black-keys')
  })
})

describe('Pop-Pfad: Stufen', () => {
  it('Nachbarn unterscheiden sich in genau einer Achse', () => {
    for (const x of allCells(DEFAULT_PATTERNS)) for (const n of neighbours(x)) expect(axisDistance(x, n.cell)).toBe(1)
  })

  it('zu jedem Stand 2 bis 4 nächste Zellen, jede eine Achse vom Gemeisterten entfernt', () => {
    const known = elementsOf(popLesson(startCell()))
    const states: Cell[][] = [[], [c()], [c(), c({ pattern: 'ballade' })], [c(), c({ voicing: 'nah' }), c({ key: 'g' })]]
    for (const mastered of states) {
      const next = frontier(mastered, known)
      expect(next.length, JSON.stringify(mastered)).toBeGreaterThanOrEqual(2)
      expect(next.length).toBeLessThanOrEqual(4)
      const done = new Set(mastered.map(cellId))
      for (const n of next) {
        expect(done.has(cellId(n.cell))).toBe(false)
        if (mastered.length) expect(mastered.some((m) => axisDistance(m, n.cell) === 1)).toBe(true)
      }
    }
  })

  it('ohne Gemeistertes beginnt der Pfad beim Einstieg', () => {
    expect(frontier([], [])[0].cell).toEqual(startCell())
  })

  it('die leichteste Achse zuerst: wer Achtel noch nicht kennt, bekommt erst etwas ohne Achtel', () => {
    const known = elementsOf(popLesson(startCell()))
    const next = frontier([c()], known)
    expect(next[0].fresh.length).toBeLessThanOrEqual(next[next.length - 1].fresh.length)
  })
})
