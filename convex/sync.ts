import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { sha256, validDeviceToken as validToken } from './keys'
import { attemptFields } from './schema'

const PAIR_CODE_TTL_MS = 10 * 60 * 1000
const MAX_BATCH = 200

/**
 * Versuchslimit beim Einlösen: je Gerät 5 Fehlversuche pro Viertelstunde, über alle Geräte 200.
 * Das zweite Limit bremst Angreifer, die sich für jeden Versuch einen neuen Schlüssel ausdenken;
 * bei 32^8 möglichen Codes bleibt Raten damit aussichtslos.
 */
export const PAIR_WINDOW_MS = 15 * 60 * 1000
export const PAIR_FAILS_PER_DEVICE = 5
export const PAIR_FAILS_GLOBAL = 200
/** Kopplungscode: 8 Zeichen ohne Verwechslungsgefahr (kein I, O, 0, 1) */
export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '')

async function findDevice(ctx: QueryCtx, token: string) {
  if (!validToken(token)) return null
  const tokenHash = await sha256(token)
  return ctx.db
    .query('devices')
    .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
    .unique()
}

/** Nur Geräteschlüssel. KI-Schlüssel (`pb_…`) gelten hier nie, siehe `agents.ts`. */
export async function requireDevice(ctx: QueryCtx, token: string) {
  const d = await findDevice(ctx, token)
  if (!d) throw new Error('Unbekanntes Gerät')
  return d
}

const attemptValidator = v.object(attemptFields)

/** Erstes Gerät: legt ein neues Profil an. Wiederholbar mit demselben Schlüssel. */
export const register = mutation({
  args: { token: v.string(), label: v.string() },
  returns: v.null(),
  handler: async (ctx, { token, label }) => {
    if (!validToken(token)) throw new Error('Ungültiger Schlüssel')
    if (await findDevice(ctx, token)) return null
    const profileId = await ctx.db.insert('profiles', { createdAt: Date.now() })
    await ctx.db.insert('devices', {
      profileId,
      tokenHash: await sha256(token),
      label: label.slice(0, 60),
      createdAt: Date.now(),
    })
    return null
  },
})

/** Durchgänge hochladen. Doppelte (gleiche attemptId) werden übersprungen. */
export const pushAttempts = mutation({
  args: { token: v.string(), attempts: v.array(attemptValidator) },
  returns: v.object({ stored: v.number() }),
  handler: async (ctx, { token, attempts }) => {
    if (attempts.length > MAX_BATCH) throw new Error('Zu viele Durchgänge auf einmal')
    const device = await requireDevice(ctx, token)
    let stored = 0
    for (const a of attempts) {
      const exists = await ctx.db
        .query('attempts')
        .withIndex('by_profile_attempt', (q) => q.eq('profileId', device.profileId).eq('attemptId', a.attemptId))
        .first()
      if (exists) continue
      await ctx.db.insert('attempts', { profileId: device.profileId, ...a })
      stored++
    }
    return { stored }
  },
})

/** Alle Durchgänge des Profils, live auf jedem gekoppelten Gerät. null = Gerät unbekannt. */
export const attempts = query({
  args: { token: v.string() },
  returns: v.union(v.null(), v.array(attemptValidator)),
  handler: async (ctx, { token }) => {
    const device = await findDevice(ctx, token)
    if (!device) return null
    const rows = await ctx.db
      .query('attempts')
      .withIndex('by_profile', (q) => q.eq('profileId', device.profileId))
      .order('desc')
      .take(5000)
    return rows.map(({ _id, _creationTime, profileId, ...a }) => a)
  },
})

/** Gekoppelte Geräte des Profils */
export const devices = query({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.array(v.object({ id: v.id('devices'), label: v.string(), createdAt: v.number(), self: v.boolean() })),
  ),
  handler: async (ctx, { token }) => {
    const device = await findDevice(ctx, token)
    if (!device) return null
    const all = await ctx.db
      .query('devices')
      .withIndex('by_profile', (q) => q.eq('profileId', device.profileId))
      .collect()
    return all.map((d) => ({ id: d._id, label: d.label, createdAt: d.createdAt, self: d._id === device._id }))
  },
})

/**
 * Ein anderes Gerät aus dem Profil entfernen (verloren, verkauft, nicht mehr gewollt). Sein
 * Schlüssel gilt sofort nicht mehr, Codes, die es angeboten hat, verfallen. Das entfernte Gerät
 * meldet sich danach mit neuem Schlüssel als eigenes, leeres Profil an. Sich selbst entfernt
 * man nicht, sonst bliebe ein Profil ohne Gerät zurück.
 */
export const removeDevice = mutation({
  args: { token: v.string(), deviceId: v.id('devices') },
  returns: v.null(),
  handler: async (ctx, { token, deviceId }) => {
    const me = await requireDevice(ctx, token)
    const target = await ctx.db.get(deviceId)
    if (!target || target.profileId !== me.profileId) throw new Error('Unbekanntes Gerät')
    if (target._id === me._id) throw new Error('Dieses Gerät kann sich nicht selbst entfernen')
    await deleteDevice(ctx, target._id)
    return null
  },
})

async function deleteDevice(ctx: MutationCtx, deviceId: Id<'devices'>) {
  const codes = await ctx.db
    .query('pairCodes')
    .withIndex('by_device', (q) => q.eq('deviceId', deviceId))
    .collect()
  for (const c of codes) await ctx.db.delete(c._id)
  await ctx.db.delete(deviceId)
}

/** Fehlversuche im laufenden Fenster; abgelaufene Fenster zählen als 0. */
async function failures(ctx: QueryCtx, key: string, now: number) {
  const row = await ctx.db
    .query('pairFailures')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique()
  return { row, count: row && row.windowStart + PAIR_WINDOW_MS > now ? row.count : 0 }
}

async function countFailure(ctx: MutationCtx, key: string, now: number) {
  const { row, count } = await failures(ctx, key, now)
  if (!row) await ctx.db.insert('pairFailures', { key, windowStart: now, count: 1 })
  else if (count === 0) await ctx.db.patch(row._id, { windowStart: now, count: 1 })
  else await ctx.db.patch(row._id, { count: count + 1 })
}

/**
 * Gerät A erzeugt den Code selbst (Zufall im Browser) und meldet nur dessen Hash an.
 * Je Gerät gilt nur der zuletzt angebotene Code. Je Code gibt es nur eine Zeile: Gleichlautende
 * ältere fallen weg, egal von wem. Sonst könnte ein Angreifer Codes „anbieten“, um fremde zu
 * treffen, ohne dass ein Fehlversuch zählt. Die Antwort ist in beiden Fällen gleich.
 */
export const offerPairCode = mutation({
  args: { token: v.string(), code: v.string() },
  returns: v.object({ expiresAt: v.number() }),
  handler: async (ctx, { token, code }) => {
    const device = await requireDevice(ctx, token)
    const norm = normalizeCode(code)
    if (norm.length !== 8) throw new Error('Ungültiger Code')
    const codeHash = await sha256(norm)
    const mine = await ctx.db
      .query('pairCodes')
      .withIndex('by_device', (q) => q.eq('deviceId', device._id))
      .collect()
    const same = await ctx.db
      .query('pairCodes')
      .withIndex('by_codeHash', (q) => q.eq('codeHash', codeHash))
      .collect()
    for (const id of new Set([...mine, ...same].map((c) => c._id))) await ctx.db.delete(id)
    const expiresAt = Date.now() + PAIR_CODE_TTL_MS
    await ctx.db.insert('pairCodes', { profileId: device.profileId, codeHash, expiresAt, deviceId: device._id })
    return { expiresAt }
  },
})

/**
 * Gerät B löst den Code ein: Sein Schlüssel gehört danach zum Profil von Gerät A. Durchgänge,
 * die Gerät B schon in einem eigenen Profil hatte, ziehen mit um. Ein Code gilt nur einmal.
 * Fehlversuche sind begrenzt (siehe PAIR_FAILS_*); ist das Limit erreicht, prüft der Server
 * gar nicht erst, auch einen richtigen Code nicht.
 */
export const claimPairCode = mutation({
  args: { token: v.string(), code: v.string(), label: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), moved: v.number() }),
    v.object({ ok: v.literal(false), reason: v.union(v.literal('invalid'), v.literal('locked')) }),
  ),
  handler: async (ctx, { token, code, label }) => {
    if (!validToken(token)) throw new Error('Ungültiger Schlüssel')
    const now = Date.now()
    const deviceKey = `device:${await sha256(token)}`
    if (
      (await failures(ctx, deviceKey, now)).count >= PAIR_FAILS_PER_DEVICE ||
      (await failures(ctx, 'global', now)).count >= PAIR_FAILS_GLOBAL
    )
      return { ok: false as const, reason: 'locked' as const }
    const fail = async () => {
      await countFailure(ctx, deviceKey, now)
      await countFailure(ctx, 'global', now)
      return { ok: false as const, reason: 'invalid' as const }
    }

    const norm = normalizeCode(code)
    if (norm.length !== 8) return fail()
    const codeHash = await sha256(norm)
    const pc = await ctx.db
      .query('pairCodes')
      .withIndex('by_codeHash', (q) => q.eq('codeHash', codeHash))
      .first()
    if (!pc) return fail()
    await ctx.db.delete(pc._id)
    if (pc.expiresAt < now) return fail()
    // Das anbietende Gerät muss noch zum Profil gehören (nicht entfernt, nicht weggekoppelt)
    const issuer = pc.deviceId ? await ctx.db.get(pc.deviceId) : null
    if (!issuer || issuer.profileId !== pc.profileId) return fail()

    const target = pc.profileId
    let moved = 0
    const existing = await findDevice(ctx, token)
    if (existing) {
      if (existing.profileId === target) return { ok: true as const, moved: 0 }
      const old = existing.profileId
      await ctx.db.patch(existing._id, { profileId: target, label: label.slice(0, 60) })
      // Hängt kein anderes Gerät mehr am alten Profil, ziehen dessen Durchgänge mit um
      // (ohne Doppelte) und das leere Profil wird gelöscht. Sonst bleiben sie den anderen.
      const others = await ctx.db
        .query('devices')
        .withIndex('by_profile', (q) => q.eq('profileId', old))
        .first()
      if (!others) {
        const rows = await ctx.db
          .query('attempts')
          .withIndex('by_profile', (q) => q.eq('profileId', old))
          .collect()
        for (const r of rows) {
          const dup = await ctx.db
            .query('attempts')
            .withIndex('by_profile_attempt', (q) => q.eq('profileId', target).eq('attemptId', r.attemptId))
            .first()
          if (dup) await ctx.db.delete(r._id)
          else {
            await ctx.db.patch(r._id, { profileId: target })
            moved++
          }
        }
        // KI-Zugänge des alten Profils gelten nicht im neuen weiter: Das neue Profil hat sie nie erteilt
        const keys = await ctx.db
          .query('agentKeys')
          .withIndex('by_profile', (q) => q.eq('profileId', old))
          .collect()
        for (const k of keys) if (!k.revokedAt) await ctx.db.patch(k._id, { revokedAt: Date.now() })
        await ctx.db.delete(old)
      }
    } else {
      await ctx.db.insert('devices', {
        profileId: target,
        tokenHash: await sha256(token),
        label: label.slice(0, 60),
        createdAt: Date.now(),
      })
    }
    return { ok: true as const, moved }
  },
})
