/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { sha256 } from './keys'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const tokenA = 'a'.repeat(43)
const tokenB = 'b'.repeat(43)
const tokenC = 'c'.repeat(43)
const secret = 's'.repeat(43)
const DAY = 24 * 60 * 60 * 1000

const attempt = (id: string) => ({
  attemptId: id,
  at: 1_700_000_000_000,
  lessonId: 'lh-fuenf',
  stage: 'L' as const,
  clean: true,
  wrong: 0,
  unverified: 0,
  source: 'mic',
  durationMs: 20_000,
})

const realNow = Date.now
afterEach(() => {
  Date.now = realNow
})
const travel = (ms: number) => {
  const base = Date.now()
  Date.now = () => base + ms
}

type T = ReturnType<typeof convexTest>

async function setup() {
  const t = convexTest(schema, modules)
  await t.mutation(api.sync.register, { token: tokenA, label: 'iPhone' })
  return t
}

async function pair(t: T, from: string, to: string, code = 'ABCD2345') {
  await t.mutation(api.sync.offerPairCode, { token: from, code })
  return t.mutation(api.sync.claimPairCode, { token: to, code, label: 'iPad' })
}

async function newKey(
  t: T,
  opts: { scopes?: ('progress.read' | 'pieces.write')[]; days?: number; name?: string; s?: string } = {},
) {
  const s = opts.s ?? secret
  const { id } = await t.mutation(api.agents.create, {
    token: tokenA,
    name: opts.name ?? 'Claude',
    scopes: opts.scopes ?? ['progress.read'],
    days: opts.days ?? 90,
    secretHash: await sha256(s),
  })
  return { id, key: `pb_${id}_${s}` }
}

const verify = (t: T, key: string, scope?: 'progress.read' | 'pieces.write') =>
  t.mutation(api.agents.verify, { key, tool: 'get_context', scope })

const calls = (t: T) => t.run((ctx) => ctx.db.query('agentCalls').collect())

describe('Geräte entfernen', () => {
  it('der Schlüssel eines entfernten Geräts gilt sofort nicht mehr, das andere Gerät arbeitet weiter', async () => {
    const t = await setup()
    await pair(t, tokenA, tokenB)
    await t.mutation(api.sync.pushAttempts, { token: tokenA, attempts: [attempt('a1')] })
    const ipad = (await t.query(api.sync.devices, { token: tokenA }))!.find((d) => !d.self)!

    await t.mutation(api.sync.removeDevice, { token: tokenA, deviceId: ipad.id })

    expect(await t.query(api.sync.attempts, { token: tokenB })).toBeNull()
    expect(await t.query(api.sync.devices, { token: tokenB })).toBeNull()
    await expect(t.mutation(api.sync.pushAttempts, { token: tokenB, attempts: [attempt('b1')] })).rejects.toThrow()
    await expect(t.mutation(api.sync.offerPairCode, { token: tokenB, code: 'ZZZZ2345' })).rejects.toThrow()
    await expect(t.mutation(api.sync.removeDevice, { token: tokenB, deviceId: ipad.id })).rejects.toThrow()

    await t.mutation(api.sync.pushAttempts, { token: tokenA, attempts: [attempt('a2')] })
    expect(await t.query(api.sync.attempts, { token: tokenA })).toHaveLength(2)
    expect(await t.query(api.sync.devices, { token: tokenA })).toHaveLength(1)
  })

  it('ein entferntes Gerät kommt über einen Code, den es vorher angeboten hat, nicht zurück', async () => {
    const t = await setup()
    await pair(t, tokenA, tokenB)
    await t.mutation(api.sync.offerPairCode, { token: tokenB, code: 'BACK2345' })
    const ipad = (await t.query(api.sync.devices, { token: tokenA }))!.find((d) => !d.self)!
    await t.mutation(api.sync.removeDevice, { token: tokenA, deviceId: ipad.id })

    const r = await t.mutation(api.sync.claimPairCode, { token: tokenC, code: 'BACK2345', label: 'Mac' })
    expect(r.ok).toBe(false)
    expect(await t.query(api.sync.attempts, { token: tokenC })).toBeNull()
  })

  it('ein Gerät kann keine Geräte eines fremden Profils entfernen und sich nicht selbst', async () => {
    const t = await setup()
    await t.mutation(api.sync.register, { token: tokenC, label: 'Fremd' })
    const own = (await t.query(api.sync.devices, { token: tokenA }))![0]
    const foreign = (await t.query(api.sync.devices, { token: tokenC }))![0]

    await expect(t.mutation(api.sync.removeDevice, { token: tokenA, deviceId: foreign.id })).rejects.toThrow()
    await expect(t.mutation(api.sync.removeDevice, { token: tokenA, deviceId: own.id })).rejects.toThrow()
    expect(await t.query(api.sync.devices, { token: tokenC })).toHaveLength(1)
    expect(await t.query(api.sync.devices, { token: tokenA })).toHaveLength(1)
  })
})

describe('Versuchslimit beim Koppeln', () => {
  it('nach 5 Fehlversuchen eines Geräts gilt auch der richtige Code nicht, nach einer Viertelstunde wieder', async () => {
    const t = await setup()
    await t.mutation(api.sync.offerPairCode, { token: tokenA, code: 'ABCD2345' })
    for (let i = 0; i < 5; i++) {
      const r = await t.mutation(api.sync.claimPairCode, { token: tokenB, code: `WRNG234${i + 2}`, label: 'iPad' })
      expect(r).toEqual({ ok: false, reason: 'invalid' })
    }
    expect(await t.mutation(api.sync.claimPairCode, { token: tokenB, code: 'ABCD2345', label: 'iPad' })).toEqual({
      ok: false,
      reason: 'locked',
    })
    expect(await t.query(api.sync.attempts, { token: tokenB })).toBeNull()

    travel(16 * 60 * 1000)
    await t.mutation(api.sync.offerPairCode, { token: tokenA, code: 'EFGH2345' })
    expect((await t.mutation(api.sync.claimPairCode, { token: tokenB, code: 'EFGH2345', label: 'iPad' })).ok).toBe(true)
  })

  it('wer für jeden Versuch einen neuen Schlüssel nimmt, stößt an das Limit über alle Geräte', async () => {
    const t = await setup()
    await t.mutation(api.sync.offerPairCode, { token: tokenA, code: 'ABCD2345' })
    for (let i = 0; i < 200; i++) {
      const token = `x${String(i).padStart(3, '0')}`.padEnd(43, 'x')
      await t.mutation(api.sync.claimPairCode, { token, code: 'WRNG2345', label: 'x' })
    }
    expect(await t.mutation(api.sync.claimPairCode, { token: tokenB, code: 'ABCD2345', label: 'iPad' })).toEqual({
      ok: false,
      reason: 'locked',
    })
  })

  it('wer einen fremden Code selbst anbietet, landet beim Einlösen nur im eigenen Profil', async () => {
    const t = await setup()
    await t.mutation(api.sync.pushAttempts, { token: tokenA, attempts: [attempt('a1')] })
    await t.mutation(api.sync.offerPairCode, { token: tokenA, code: 'ABCD2345' })
    // Angreifer: eigenes Profil, bietet denselben Code an und löst ihn mit einem zweiten Schlüssel ein
    await t.mutation(api.sync.register, { token: tokenC, label: 'Angreifer' })
    await t.mutation(api.sync.offerPairCode, { token: tokenC, code: 'ABCD2345' })
    expect((await t.mutation(api.sync.claimPairCode, { token: tokenB, code: 'ABCD2345', label: 'x' })).ok).toBe(true)
    expect(await t.query(api.sync.attempts, { token: tokenB })).toEqual([])
    expect(await t.query(api.sync.devices, { token: tokenA })).toHaveLength(1)
  })

  it('je Gerät gilt nur der zuletzt angebotene Code', async () => {
    const t = await setup()
    await t.mutation(api.sync.offerPairCode, { token: tokenA, code: 'ABCD2345' })
    await t.mutation(api.sync.offerPairCode, { token: tokenA, code: 'EFGH2345' })
    expect((await t.mutation(api.sync.claimPairCode, { token: tokenB, code: 'ABCD2345', label: 'x' })).ok).toBe(false)
    expect((await t.mutation(api.sync.claimPairCode, { token: tokenB, code: 'EFGH2345', label: 'x' })).ok).toBe(true)
  })

  it('der Code eines Geräts, das inzwischen in ein anderes Profil gewechselt ist, gilt nicht mehr', async () => {
    const t = await setup()
    await t.mutation(api.sync.register, { token: tokenC, label: 'Mac' })
    await t.mutation(api.sync.offerPairCode, { token: tokenA, code: 'QLDA2345' })
    // A wechselt in das Profil von C; sein altes Profil wird gelöscht
    await pair(t, tokenC, tokenA, 'MQVE2345')
    const r = await t.mutation(api.sync.claimPairCode, { token: tokenB, code: 'QLDA2345', label: 'iPad' })
    expect(r.ok).toBe(false)
    expect(await t.query(api.sync.attempts, { token: tokenB })).toBeNull()
  })

  it('ein Tippfehler zählt, sperrt aber nicht: der richtige Code geht danach', async () => {
    const t = await setup()
    await t.mutation(api.sync.offerPairCode, { token: tokenA, code: 'ABCD2345' })
    for (let i = 0; i < 4; i++) await t.mutation(api.sync.claimPairCode, { token: tokenB, code: 'ABCD2346', label: 'iPad' })
    expect((await t.mutation(api.sync.claimPairCode, { token: tokenB, code: 'ABCD2345', label: 'iPad' })).ok).toBe(true)
  })
})

describe('KI-Zugänge: Grenzen zu Geräten', () => {
  it('ein KI-Schlüssel kann weder koppeln noch Durchgänge hochladen noch sich als Gerät anmelden', async () => {
    const t = await setup()
    const { key } = await newKey(t, { scopes: ['progress.read', 'pieces.write'] })

    await t.mutation(api.sync.offerPairCode, { token: tokenA, code: 'ABCD2345' })
    await expect(t.mutation(api.sync.claimPairCode, { token: key, code: 'ABCD2345', label: 'KI' })).rejects.toThrow()
    await expect(t.mutation(api.sync.offerPairCode, { token: key, code: 'EFGH2345' })).rejects.toThrow()
    await expect(t.mutation(api.sync.pushAttempts, { token: key, attempts: [attempt('k1')] })).rejects.toThrow()
    await expect(t.mutation(api.sync.register, { token: key, label: 'KI' })).rejects.toThrow()
    expect(await t.query(api.sync.attempts, { token: key })).toBeNull()
    expect(await t.query(api.sync.devices, { token: tokenA })).toHaveLength(1)
    // Der Code ist nicht verbraucht: Ein echtes Gerät kann ihn noch einlösen
    expect((await t.mutation(api.sync.claimPairCode, { token: tokenB, code: 'ABCD2345', label: 'iPad' })).ok).toBe(true)
  })

  it('ein KI-Schlüssel kann keine Zugänge anlegen, auflisten oder Geräte entfernen', async () => {
    const t = await setup()
    const { key, id } = await newKey(t)
    const own = (await t.query(api.sync.devices, { token: tokenA }))![0]
    await expect(
      t.mutation(api.agents.create, {
        token: key,
        name: 'x',
        scopes: ['pieces.write'],
        days: 1,
        secretHash: await sha256(tokenC),
      }),
    ).rejects.toThrow()
    expect(await t.query(api.agents.list, { token: key })).toBeNull()
    await expect(t.mutation(api.agents.revoke, { token: key, id })).rejects.toThrow()
    await expect(t.mutation(api.sync.removeDevice, { token: key, deviceId: own.id })).rejects.toThrow()
  })

  it('ein Geräteschlüssel gilt nie als KI-Schlüssel', async () => {
    const t = await setup()
    const { id } = await newKey(t)
    expect((await verify(t, tokenA)).ok).toBe(false)
    // auch nicht in KI-Form verpackt
    expect((await verify(t, `pb_${id}_${tokenA}`)).ok).toBe(false)
  })

  it('der normale Geräteschlüssel funktioniert weiter, wenn es KI-Zugänge gibt', async () => {
    const t = await setup()
    await newKey(t)
    await t.mutation(api.sync.pushAttempts, { token: tokenA, attempts: [attempt('a1')] })
    expect(await t.query(api.sync.attempts, { token: tokenA })).toHaveLength(1)
    expect((await pair(t, tokenA, tokenB)).ok).toBe(true)
  })
})

describe('KI-Zugänge prüfen', () => {
  it('ein gültiger Schlüssel nennt Profil, Name und Rechte', async () => {
    const t = await setup()
    const { key } = await newKey(t, { name: 'Claude Code', scopes: ['progress.read'] })
    const r = await verify(t, key, 'progress.read')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.name).toBe('Claude Code')
    expect(r.data.scopes).toEqual(['progress.read'])
    const profileId = await t.run(async (ctx) => (await ctx.db.query('devices').first())!.profileId)
    expect(r.data.profileId).toBe(profileId)
  })

  it('lehnt ein fehlendes Recht ab', async () => {
    const t = await setup()
    const { key } = await newKey(t, { scopes: ['progress.read'] })
    expect(await verify(t, key, 'pieces.write')).toMatchObject({ ok: false, code: 'forbidden' })
  })

  it('lehnt einen abgelaufenen Schlüssel ab', async () => {
    const t = await setup()
    const { key } = await newKey(t, { days: 7 })
    travel(7 * DAY + 1000)
    expect(await verify(t, key)).toMatchObject({ ok: false, code: 'expired' })
  })

  it('lehnt einen widerrufenen Schlüssel sofort ab', async () => {
    const t = await setup()
    const { key, id } = await newKey(t)
    expect((await verify(t, key)).ok).toBe(true)
    await t.mutation(api.agents.revoke, { token: tokenA, id })
    expect(await verify(t, key)).toMatchObject({ ok: false, code: 'revoked' })
    expect(await t.query(api.agents.list, { token: tokenA })).toEqual([])
  })

  it('lehnt ein falsches Geheimnis und Unsinn ab', async () => {
    const t = await setup()
    const { id } = await newKey(t)
    expect(await verify(t, `pb_${id}_${'t'.repeat(43)}`)).toMatchObject({ ok: false, code: 'unauthorized' })
    expect(await verify(t, 'pb_nichts_da')).toMatchObject({ ok: false, code: 'unauthorized' })
    expect(await verify(t, '')).toMatchObject({ ok: false, code: 'unauthorized' })
    // Wer nur die ID kennt, schreibt nichts ins Protokoll
    expect(await calls(t)).toEqual([])
  })

  it('ein fremdes Profil kann einen Zugang nicht widerrufen', async () => {
    const t = await setup()
    await t.mutation(api.sync.register, { token: tokenC, label: 'Fremd' })
    const { key, id } = await newKey(t)
    await expect(t.mutation(api.agents.revoke, { token: tokenC, id })).rejects.toThrow()
    expect((await verify(t, key)).ok).toBe(true)
  })

  it('protokolliert jeden Aufruf ohne Inhalte und setzt „zuletzt benutzt“', async () => {
    const t = await setup()
    const { key, id } = await newKey(t)
    expect((await t.query(api.agents.list, { token: tokenA }))![0].lastUsedAt).toBeNull()
    await verify(t, key)
    await verify(t, key, 'pieces.write')
    const rows = await calls(t)
    expect(rows.map((r) => r.outcome)).toEqual(['ok', 'forbidden'])
    expect(rows.every((r) => r.keyId === id && r.tool === 'get_context')).toBe(true)
    expect(Object.keys(rows[0]).sort()).toEqual(['_creationTime', '_id', 'at', 'keyId', 'outcome', 'profileId', 'tool'])
    expect((await t.query(api.agents.list, { token: tokenA }))![0].lastUsedAt).toBeTypeOf('number')
  })

  it('übernimmt ein Profil beim Koppeln ein anderes, gelten dessen KI-Zugänge nicht mit', async () => {
    const t = await setup()
    const { key } = await newKey(t)
    await t.mutation(api.sync.register, { token: tokenC, label: 'Mac' })
    // Gerät A wechselt ins Profil von C; sein altes Profil samt KI-Zugang verschwindet
    await pair(t, tokenC, tokenA)
    expect(await verify(t, key)).toMatchObject({ ok: false, code: 'revoked' })
  })
})

describe('KI-Zugänge anlegen', () => {
  it('höchstens 5 gleichzeitig; abgelaufene und widerrufene zählen nicht', async () => {
    const t = await setup()
    const ids = []
    for (let i = 0; i < 5; i++) ids.push((await newKey(t, { days: i === 0 ? 1 : 90 })).id)
    await expect(newKey(t)).rejects.toThrow()
    await t.mutation(api.agents.revoke, { token: tokenA, id: ids[1] })
    await newKey(t)
    await expect(newKey(t)).rejects.toThrow()
    travel(DAY + 1000)
    await newKey(t)
  })

  it('Ablauf ist Pflicht: 1 bis 365 Tage', async () => {
    const t = await setup()
    for (const days of [0, 366, 1.5, -1]) await expect(newKey(t, { days })).rejects.toThrow()
    const { key } = await newKey(t, { days: 365 })
    travel(364 * DAY)
    expect((await verify(t, key)).ok).toBe(true)
  })

  it('braucht mindestens ein Recht und einen Namen', async () => {
    const t = await setup()
    await expect(newKey(t, { scopes: [] })).rejects.toThrow()
    await expect(newKey(t, { name: '   ' })).rejects.toThrow()
  })

})
