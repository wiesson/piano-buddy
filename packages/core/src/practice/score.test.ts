import { describe, expect, it } from 'vitest'
import { bestOf, percentOf, praiseFor, starsFor } from './score'

describe('Prozent', () => {
  it('100 % gibt es nur ohne Fehler, auch bei sehr vielen Schritten', () => {
    expect(percentOf(200, 1)).toBe(99)
    expect(percentOf(200, 0)).toBe(100)
    expect(percentOf(9, 1)).toBe(88)
    expect(percentOf(9, 9)).toBe(0)
  })
})

describe('Sterne', () => {
  it('★ ab 70 %, ★★ ab 90 %, ★★★ nur sauber', () => {
    expect(starsFor(69, false)).toBe(0)
    expect(starsFor(70, false)).toBe(1)
    expect(starsFor(89, false)).toBe(1)
    expect(starsFor(90, false)).toBe(2)
    expect(starsFor(99, false)).toBe(2)
    expect(starsFor(100, true)).toBe(3)
  })
})

describe('Bestwert', () => {
  it('ist der höchste Prozentwert der Stufe', () => {
    expect(bestOf([{ clean: false, percent: 72 }, { clean: false, percent: 91 }, { clean: false, percent: 80 }])).toEqual({
      percent: 91,
      stars: 2,
    })
  })

  it('ältere Versuche ohne Prozent: sauber zählt als 100 %, nicht sauber als unbekannt', () => {
    expect(bestOf([{ clean: false }])).toBeNull()
    expect(bestOf([{ clean: false }, { clean: false, percent: 75 }])).toEqual({ percent: 75, stars: 1 })
    expect(bestOf([{ clean: true }, { clean: false, percent: 75 }])).toEqual({ percent: 100, stars: 3 })
  })
})

describe('Lob', () => {
  const pass = (percent: number, missedBars: number[] = [1]) => ({ clean: percent === 100, percent, missedBars: percent === 100 ? [] : missedBars })

  it('mehr Sterne als je zuvor', () => {
    expect(praiseFor([{ clean: false, percent: 80 }], pass(92))).toEqual({ kind: 'stars', stars: 2 })
    expect(praiseFor([{ clean: false, percent: 95 }], pass(100))).toEqual({ kind: 'stars', stars: 3 })
  })

  it('neuer Bestwert nur, wenn er den alten übertrifft', () => {
    expect(praiseFor([{ clean: false, percent: 80 }], pass(85))).toEqual({ kind: 'best', percent: 85 })
    expect(praiseFor([{ clean: false, percent: 85 }], pass(85))).toBeNull()
    expect(praiseFor([{ clean: false, percent: 90 }], pass(85))).toBeNull()
  })

  it('kein Lob für ★★★, wenn die Stufe schon einmal sauber war', () => {
    expect(praiseFor([{ clean: true, percent: 100 }], pass(100))).toBeNull()
  })

  it('ohne Sterne und ohne früheren Wert gibt es kein Lob', () => {
    expect(praiseFor([], pass(50))).toBeNull()
  })

  it('Takt zum ersten Mal fehlerfrei: nur wenn er in jedem bekannten Versuch Fehler hatte', () => {
    const prev = [
      { clean: false, percent: 60, missedBars: [2, 5] },
      { clean: false, percent: 60, missedBars: [5] },
    ]
    expect(praiseFor(prev, pass(60, [2]))).toEqual({ kind: 'bar', bar: 5 })
    // Takt 2 war im zweiten Versuch schon fehlerfrei: nicht neu
    expect(praiseFor(prev, pass(60, [5]))).toBeNull()
    // Schon einmal sauber: Jeder Takt war schon fehlerfrei
    expect(praiseFor([...prev, { clean: true, percent: 100 }], pass(60, [2]))).toBeNull()
  })
})
