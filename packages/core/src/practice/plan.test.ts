import { describe, expect, it } from 'vitest'
import type { Attempt } from '../sync/store'
import type { Stage } from '../music/lessons'
import { addDays, coveredByHigher, dailyPlan, dayKey, stageStates, stateFor, streak } from './plan'

/** Ein Versuch an einem Tag (Mittag in der Zeitzone des Geräts), Reihenfolge über die Minute */
let seq = 0
function at(day: string, lessonId: string, stage: Stage, clean: boolean, minute = seq++): Attempt {
  const [y, m, d] = day.split('-').map(Number)
  return {
    attemptId: `a${seq}`,
    at: new Date(y, m - 1, d, 12, minute % 60, Math.floor(minute / 60)).getTime(),
    lessonId,
    stage,
    clean,
    wrong: clean ? 0 : 1,
    unverified: 0,
    source: 'midi',
    durationMs: 30_000,
  }
}
const D1 = '2026-11-02'
const day = (n: number) => addDays(D1, n)
const three = (d: string, lessonId = 'lh-fuenf', stage: Stage = 'L') => [0, 1, 2].map(() => at(d, lessonId, stage, true))
const state = (attempts: Attempt[], lessonId = 'lh-fuenf', stage: Stage = 'L') => stateFor(stageStates(attempts), lessonId, stage)!

describe('Fortschritt einer Stufe', () => {
  it('neu ohne Versuche, lernt mit Versuchen', () => {
    expect(state([]).status).toBe('new')
    expect(state([at(D1, 'lh-fuenf', 'L', false)]).status).toBe('learning')
  })

  it('drei saubere Durchgänge: sitzt, ist aber erst morgen prüfbar', () => {
    const s = state(three(D1))
    expect(s).toMatchObject({ status: 'learned', level: 0, due: day(1), clean: 3 })
  })

  it('weitere Durchgänge am selben Tag festigen nicht', () => {
    expect(state([...three(D1), at(D1, 'lh-fuenf', 'L', true)]).status).toBe('learned')
  })

  it('am nächsten Tag der erste Versuch sauber: gefestigt, nächste Wiederholung in 3 Tagen', () => {
    const s = state([...three(D1), at(day(1), 'lh-fuenf', 'L', true)])
    expect(s).toMatchObject({ status: 'firm', level: 1, due: day(4) })
  })

  it('erster Versuch am nächsten Tag mit Fehlern: nicht gefestigt, morgen wieder', () => {
    // auch wenn danach am selben Tag saubere Durchgänge kommen
    const s = state([...three(D1), at(day(1), 'lh-fuenf', 'L', false), at(day(1), 'lh-fuenf', 'L', true)])
    expect(s).toMatchObject({ status: 'learned', level: 0, due: day(2) })
  })

  it('Abstände wachsen: 1, 3, 7, 21 Tage', () => {
    const a = [...three(D1)]
    a.push(at(day(1), 'lh-fuenf', 'L', true)) // gefestigt, nächste in 3
    expect(state(a).due).toBe(day(4))
    a.push(at(day(4), 'lh-fuenf', 'L', true)) // nächste in 7
    expect(state(a).due).toBe(day(11))
    a.push(at(day(11), 'lh-fuenf', 'L', true)) // nächste in 21
    expect(state(a).due).toBe(day(32))
    a.push(at(day(32), 'lh-fuenf', 'L', true)) // bleibt bei 21
    expect(state(a).due).toBe(day(53))
  })

  it('verpasste Wiederholung: der erste Versuch danach entscheidet', () => {
    const s = state([...three(D1), at(day(5), 'lh-fuenf', 'L', true)])
    expect(s).toMatchObject({ status: 'firm', due: day(8) })
  })

  it('Üben vor dem fälligen Tag verschiebt nichts', () => {
    const a = [...three(D1), at(day(1), 'lh-fuenf', 'L', true), at(day(2), 'lh-fuenf', 'L', false)]
    expect(state(a)).toMatchObject({ status: 'firm', due: day(4) })
  })
})

describe('Tagesplan', () => {
  it('am Anfang: die erste Stufe des Lernpfads', () => {
    const p = dailyPlan([], D1)
    expect(p.items).toEqual([{ lessonId: 'lh-fuenf', stage: 'L', kind: 'focus', done: false }])
    expect(p.complete).toBe(false)
  })

  it('nach dem Lernen: morgen Wiederholung plus der nächste Schritt', () => {
    const p = dailyPlan(three(D1), day(1))
    expect(p.items.map((i) => `${i.kind}:${i.lessonId}:${i.stage}`)).toEqual(['review:lh-fuenf:L', 'focus:rh-fuenf:R'])
  })

  it('erledigt: Wiederholung durch den ersten Versuch, Fokus durch einen sauberen Durchgang', () => {
    const a = [...three(D1), at(day(1), 'lh-fuenf', 'L', true), at(day(1), 'rh-fuenf', 'R', false)]
    let p = dailyPlan(a, day(1))
    expect(p.items[0]).toMatchObject({ kind: 'review', done: true, passed: true })
    expect(p.items[1]).toMatchObject({ kind: 'focus', done: false })
    p = dailyPlan([...a, at(day(1), 'rh-fuenf', 'R', true)], day(1))
    expect(p.complete).toBe(true)
  })

  it('der Plan des Tages bleibt stehen, auch wenn heute eine neue Stufe sitzt', () => {
    const a = [...three(D1), ...three(day(1), 'rh-fuenf', 'R')]
    const p = dailyPlan(a, day(1))
    expect(p.items.find((i) => i.kind === 'focus')).toMatchObject({ lessonId: 'rh-fuenf', stage: 'R', done: true })
  })

  it('höchstens zwei Wiederholungen, die älteste zuerst', () => {
    const a = [...three(D1, 'lh-fuenf', 'L'), ...three(D1, 'rh-fuenf', 'R'), ...three(D1, 'wechsel', 'L')]
    const reviews = dailyPlan(a, day(1)).items.filter((i) => i.kind === 'review')
    expect(reviews.map((r) => r.lessonId)).toEqual(['lh-fuenf', 'rh-fuenf'])
  })
})

describe('Fassungen im Fortschritt', () => {
  it('Versuche einer Fassung zählen nur für diese Fassung', () => {
    const states = stageStates(three(D1, 'kanon~leicht', 'R'))
    expect(stateFor(states, 'kanon~leicht', 'R')!.status).toBe('learned')
    expect(stateFor(states, 'kanon', 'R')!.status).toBe('new')
  })

  it('der Fokus folgt dem Lernpfad durch die Fassungen', () => {
    // Bis einschließlich Entchen gelernt: als Nächstes Jingle Bells leicht
    const ids = ['lh-fuenf', 'rh-fuenf', 'wechsel', 'parallel', 'mary', 'haenschen', 'entchen']
    const a = ids.flatMap((id) =>
      (['L', 'R', 'LR'] as const).flatMap((s) => (id === 'lh-fuenf' && s !== 'L') || (id === 'rh-fuenf' && s !== 'R') ? [] : three(D1, id, s)),
    )
    const focus = dailyPlan(a, day(1)).items.find((i) => i.kind === 'focus')
    expect(focus).toMatchObject({ lessonId: 'jingle~leicht', stage: 'L' })
  })

  it('wer das Original kann, muss die leichtere Fassung nicht nachholen', () => {
    const before = ['lh-fuenf', 'rh-fuenf', 'wechsel', 'parallel', 'mary', 'haenschen', 'entchen'].flatMap((id) =>
      (['L', 'R', 'LR'] as const).flatMap((s) => (id === 'lh-fuenf' && s !== 'L') || (id === 'rh-fuenf' && s !== 'R') ? [] : three(D1, id, s)),
    )
    // Jingle Bells im Original gelernt (alle Hände): weder leicht noch mittel kommen als Fokus
    const jingle = (['L', 'R', 'LR'] as const).flatMap((s) => three(D1, 'jingle', s))
    const focus = dailyPlan([...before, ...jingle], day(1)).items.find((i) => i.kind === 'focus')
    expect(focus).toMatchObject({ lessonId: 'ode~leicht', stage: 'L' })
  })

  it('nur dieselbe Hand zählt: rechts im Original gelernt erledigt links in der leichten Fassung nicht', () => {
    const states = stageStates(three(D1, 'jingle', 'R'))
    expect(coveredByHigher(states, 'jingle~leicht', 'R')).toBe(true)
    expect(coveredByHigher(states, 'jingle~leicht', 'L')).toBe(false)
    expect(coveredByHigher(states, 'jingle', 'R')).toBe(false)
  })
})

describe('Serie', () => {
  it('zählt Tage in Folge mit einem sauberen Durchgang', () => {
    const a = [at(day(0), 'lh-fuenf', 'L', true), at(day(1), 'lh-fuenf', 'L', true), at(day(2), 'lh-fuenf', 'L', true)]
    expect(streak(a, day(2))).toEqual({ days: 3, today: true })
  })

  it('heute noch offen: zählt bis gestern, heute fehlt noch', () => {
    const a = [at(day(0), 'lh-fuenf', 'L', true), at(day(1), 'lh-fuenf', 'L', true)]
    expect(streak(a, day(2))).toEqual({ days: 2, today: false })
  })

  it('ein Tag ohne sauberen Durchgang unterbricht', () => {
    const a = [at(day(0), 'lh-fuenf', 'L', true), at(day(1), 'lh-fuenf', 'L', false), at(day(2), 'lh-fuenf', 'L', true)]
    expect(streak(a, day(2))).toEqual({ days: 1, today: true })
  })

  it('Tage zählen in der Zeitzone des Geräts', () => {
    expect(dayKey(new Date(2026, 10, 2, 23, 59).getTime())).toBe('2026-11-02')
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
  })
})
