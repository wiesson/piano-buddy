/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const tokenA = 'a'.repeat(43)
const tokenB = 'b'.repeat(43)
const tokenC = 'c'.repeat(43)

const attempt = (id: string, over: Partial<Record<string, unknown>> = {}) => ({
  attemptId: id,
  at: 1_700_000_000_000,
  lessonId: 'lh-fuenf',
  stage: 'L' as const,
  clean: true,
  wrong: 0,
  unverified: 0,
  source: 'mic',
  durationMs: 20_000,
  ...over,
})

describe('Sync über Geräte', () => {
  it('zeigt Durchgänge nur dem Gerät, das sie hochgeladen hat, nicht einem fremden', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.sync.register, { token: tokenA, label: 'iPhone' })
    await t.mutation(api.sync.register, { token: tokenB, label: 'Fremd' })
    await t.mutation(api.sync.pushAttempts, { token: tokenA, attempts: [attempt('x1')] })
    expect(await t.query(api.sync.attempts, { token: tokenA })).toHaveLength(1)
    expect(await t.query(api.sync.attempts, { token: tokenB })).toEqual([])
    expect(await t.query(api.sync.attempts, { token: tokenC })).toBeNull()
  })

  it('bewahrt Ansicht, Klaviatur-Hilfe und Hilfe-Zähler eines Durchgangs, ältere Durchgänge ohne sie bleiben gültig', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.sync.register, { token: tokenA, label: 'iPhone' })
    await t.mutation(api.sync.pushAttempts, {
      token: tokenA,
      attempts: [attempt('neu', { view: 'sheet', keyHelp: 'delayed', hinted: 3 }), attempt('alt')],
    })
    const rows = await t.query(api.sync.attempts, { token: tokenA })
    expect(rows?.find((r) => r.attemptId === 'neu')).toMatchObject({ view: 'sheet', keyHelp: 'delayed', hinted: 3 })
    expect(rows?.find((r) => r.attemptId === 'alt')).not.toHaveProperty('view')
  })

  it('lehnt Uploads mit unbekanntem oder zu kurzem Schlüssel ab', async () => {
    const t = convexTest(schema, modules)
    await expect(t.mutation(api.sync.pushAttempts, { token: tokenC, attempts: [attempt('x')] })).rejects.toThrow()
    await expect(t.mutation(api.sync.register, { token: 'kurz', label: 'x' })).rejects.toThrow()
  })

  it('speichert einen erneut hochgeladenen Durchgang nicht doppelt', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.sync.register, { token: tokenA, label: 'iPhone' })
    await t.mutation(api.sync.pushAttempts, { token: tokenA, attempts: [attempt('x1'), attempt('x2')] })
    const r = await t.mutation(api.sync.pushAttempts, { token: tokenA, attempts: [attempt('x2'), attempt('x3')] })
    expect(r.stored).toBe(1)
    expect(await t.query(api.sync.attempts, { token: tokenA })).toHaveLength(3)
  })

  it('koppelt ein zweites Gerät per Code: es sieht danach dieselben Durchgänge und bringt seine mit', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.sync.register, { token: tokenA, label: 'iPhone' })
    await t.mutation(api.sync.pushAttempts, { token: tokenA, attempts: [attempt('a1')] })
    await t.mutation(api.sync.register, { token: tokenB, label: 'iPad' })
    await t.mutation(api.sync.pushAttempts, { token: tokenB, attempts: [attempt('b1')] })

    await t.mutation(api.sync.offerPairCode, { token: tokenA, code: 'KLAV-2ER3' })
    const r = await t.mutation(api.sync.claimPairCode, { token: tokenB, code: 'klav2er3', label: 'iPad' })
    expect(r).toEqual({ ok: true, moved: 1 })

    const ids = (rows: { attemptId: string }[] | null) => rows!.map((a) => a.attemptId).sort()
    expect(ids(await t.query(api.sync.attempts, { token: tokenA }))).toEqual(['a1', 'b1'])
    expect(ids(await t.query(api.sync.attempts, { token: tokenB }))).toEqual(['a1', 'b1'])
    expect(await t.query(api.sync.devices, { token: tokenA })).toHaveLength(2)
  })

  it('löst einen Code nur einmal ein', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.sync.register, { token: tokenA, label: 'iPhone' })
    await t.mutation(api.sync.offerPairCode, { token: tokenA, code: 'ABCD2345' })
    expect((await t.mutation(api.sync.claimPairCode, { token: tokenB, code: 'ABCD2345', label: 'iPad' })).ok).toBe(true)
    expect((await t.mutation(api.sync.claimPairCode, { token: tokenC, code: 'ABCD2345', label: 'Mac' })).ok).toBe(false)
    expect(await t.query(api.sync.attempts, { token: tokenC })).toBeNull()
  })

  it('löst einen abgelaufenen Code nicht ein', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.sync.register, { token: tokenA, label: 'iPhone' })
    const realNow = Date.now
    try {
      await t.mutation(api.sync.offerPairCode, { token: tokenA, code: 'ABCD2345' })
      Date.now = () => realNow() + 11 * 60 * 1000
      expect((await t.mutation(api.sync.claimPairCode, { token: tokenB, code: 'ABCD2345', label: 'iPad' })).ok).toBe(false)
    } finally {
      Date.now = realNow
    }
  })

  it('lässt einen falschen Code ins Leere laufen', async () => {
    const t = convexTest(schema, modules)
    await t.mutation(api.sync.register, { token: tokenA, label: 'iPhone' })
    await t.mutation(api.sync.offerPairCode, { token: tokenA, code: 'ABCD2345' })
    expect((await t.mutation(api.sync.claimPairCode, { token: tokenB, code: 'ABCD2346', label: 'iPad' })).ok).toBe(false)
  })
})
