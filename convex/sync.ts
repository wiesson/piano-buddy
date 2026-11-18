import { v } from 'convex/values'
import { mutation, query, type QueryCtx } from './_generated/server'
import { attemptFields } from './schema'

const PAIR_CODE_TTL_MS = 10 * 60 * 1000
const MAX_BATCH = 200

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Schlüssel müssen lang genug sein, damit sie nicht zu erraten sind (das Gerät erzeugt 32 Byte). */
const validToken = (t: string) => /^[A-Za-z0-9_-]{40,128}$/.test(t)
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
  returns: v.union(v.null(), v.array(v.object({ label: v.string(), createdAt: v.number(), self: v.boolean() }))),
  handler: async (ctx, { token }) => {
    const device = await findDevice(ctx, token)
    if (!device) return null
    const all = await ctx.db
      .query('devices')
      .withIndex('by_profile', (q) => q.eq('profileId', device.profileId))
      .collect()
    return all.map((d) => ({ label: d.label, createdAt: d.createdAt, self: d._id === device._id }))
  },
})

/** Gerät A erzeugt den Code selbst (Zufall im Browser) und meldet nur dessen Hash an. */
export const offerPairCode = mutation({
  args: { token: v.string(), code: v.string() },
  returns: v.object({ expiresAt: v.number() }),
  handler: async (ctx, { token, code }) => {
    const device = await requireDevice(ctx, token)
    const norm = normalizeCode(code)
    if (norm.length !== 8) throw new Error('Ungültiger Code')
    const expiresAt = Date.now() + PAIR_CODE_TTL_MS
    await ctx.db.insert('pairCodes', { profileId: device.profileId, codeHash: await sha256(norm), expiresAt })
    return { expiresAt }
  },
})

/**
 * Gerät B löst den Code ein: Sein Schlüssel gehört danach zum Profil von Gerät A. Durchgänge,
 * die Gerät B schon in einem eigenen Profil hatte, ziehen mit um. Ein Code gilt nur einmal.
 */
export const claimPairCode = mutation({
  args: { token: v.string(), code: v.string(), label: v.string() },
  returns: v.union(v.object({ ok: v.literal(true), moved: v.number() }), v.object({ ok: v.literal(false) })),
  handler: async (ctx, { token, code, label }) => {
    if (!validToken(token)) throw new Error('Ungültiger Schlüssel')
    const norm = normalizeCode(code)
    if (norm.length !== 8) return { ok: false as const }
    const codeHash = await sha256(norm)
    const pc = await ctx.db
      .query('pairCodes')
      .withIndex('by_codeHash', (q) => q.eq('codeHash', codeHash))
      .first()
    if (!pc) return { ok: false as const }
    await ctx.db.delete(pc._id)
    if (pc.expiresAt < Date.now()) return { ok: false as const }

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
