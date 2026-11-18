import { describe, expect, it } from 'vitest'
import { LESSONS } from './lessons'
import { notationOf, splitValue } from './notation'

const lesson = (id: string) => LESSONS.find((l) => l.id === id)!
const short = (it: { rest: boolean; value: string; dots: number; keys: { step: string; alter: number; octave: number }[] }) =>
  it.rest ? `r${it.value}${it.dots ? '.' : ''}` : `${it.keys.map((k) => k.step + (k.alter === 1 ? '#' : k.alter === -1 ? 'b' : '') + k.octave).join('+')}:${it.value}${it.dots ? '.' : ''}`

describe('Notenschrift aus den Lektionen', () => {
  // Für jedes Stück: Jeder Takt ist je Hand genau voll, und jeder Ton wird genau einmal angeschlagen
  for (const l of LESSONS) {
    it(`${l.id}: Takte voll, jeder Ton genau einmal`, () => {
      const n = notationOf(l)
      const seen: number[] = []
      for (const m of n.measures) {
        for (const hand of ['L', 'R'] as const) {
          const sum = m.items[hand].reduce((s, x) => s + x.beats, 0)
          expect(sum, `${l.id} Takt ${m.number} ${hand}`).toBeCloseTo(m.end - m.start, 6)
          for (const x of m.items[hand]) seen.push(...x.noteIndex)
        }
      }
      expect(seen.sort((a, b) => a - b)).toEqual(l.notes.map((_, i) => i))
    })
  }

  it('Ode an die Freude, Takt 4: punktierte Viertel, Achtel, Halbe', () => {
    const m = notationOf(lesson('ode')).measures[3]
    expect(m.items.R.map(short)).toEqual(['E4:q.', 'D4:8', 'D4:h'])
    expect(m.items.L.map(short)).toEqual(['G3:w'])
  })

  it('Für Elise: 3/8 mit Auftakt aus zwei Sechzehnteln, Kreuz und Auflösungszeichen', () => {
    const n = notationOf(lesson('elise'))
    expect(n.time).toEqual([3, 8])
    const [pickup, first] = n.measures
    expect(pickup.number).toBe(0)
    expect(pickup.end - pickup.start).toBe(1)
    expect(pickup.items.R.map(short)).toEqual(['E5:16', 'D#5:16'])
    expect(pickup.items.R[1].keys[0].accidental).toBe('#')
    expect(pickup.items.L.every((x) => x.rest)).toBe(true)
    // Takt 1: E Dis E H D C. Das Dis braucht im neuen Takt wieder sein Kreuz, das D danach ein Auflösungszeichen
    expect(first.items.R.map(short)).toEqual(['E5:16', 'D#5:16', 'E5:16', 'B4:16', 'D5:16', 'C5:16'])
    expect(first.items.R[1].keys[0].accidental).toBe('#')
    expect(first.items.R[4].keys[0].accidental).toBe('n')
    expect(first.items.L).toMatchObject([{ rest: true, fullBar: true }])
    // Takt 2: A Achtel, Sechzehntelpause, C E A
    expect(n.measures[2].items.R.map(short)).toEqual(['A4:8', 'r16', 'C4:16', 'E4:16', 'A4:16'])
  })

  it('Kanon in D: zwei Kreuze in der Tonart, Fis und Cis ohne eigenes Vorzeichen', () => {
    const n = notationOf(lesson('kanon'))
    expect(n.key).toBe(2)
    const keys = n.measures.flatMap((m) => [...m.items.R, ...m.items.L]).flatMap((x) => x.keys)
    expect(keys.some((k) => k.step === 'F' && k.alter === 1)).toBe(true)
    expect(keys.filter((k) => k.accidental)).toEqual([])
  })

  it('Akkorde werden ein Element mit mehreren Tönen', () => {
    const n = notationOf(lesson('vier-akkorde'))
    const chord = n.measures[0].items.R.find((x) => !x.rest)!
    expect(chord.keys.length).toBeGreaterThanOrEqual(3)
  })

  it('zerlegt nicht darstellbare Längen in Werte mit Haltebogen', () => {
    expect(splitValue(2.5).map((v) => v.value + (v.dots ? '.' : ''))).toEqual(['h', '8'])
    expect(splitValue(3).map((v) => v.value + (v.dots ? '.' : ''))).toEqual(['h.'])
  })

  it('ein Ton über den Taktstrich wird geteilt und gebunden, nur der erste Teil ist ein Anschlag', () => {
    const l = { ...lesson('ode'), pickup: undefined, beatUnit: undefined, notes: [{ midi: 60, start: 3, dur: 2, hand: 'R' as const, spelling: 'C' }] }
    const n = notationOf(l)
    const a = n.measures[0].items.R.at(-1)!
    const b = n.measures[1].items.R[0]
    expect([a.tie, a.noteIndex, b.tied, b.noteIndex]).toEqual([true, [0], true, []])
  })
})
