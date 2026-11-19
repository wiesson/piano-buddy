import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalQuery, mutation } from './_generated/server'

/**
 * Launch-Liste und Neuigkeiten mit Double-Opt-in: Die Anmeldung von der Website schickt eine
 * Bestätigungsmail; erst der Link darin meldet an. Jede Mail trägt einen Abmeldelink. Die
 * Antwort verrät nie, ob eine Adresse schon bekannt ist.
 */

export const TOPICS = ['launch', 'updates'] as const
export type Topic = (typeof TOPICS)[number]
const topic = v.union(v.literal('launch'), v.literal('updates'))

/** Höchstens eine Bestätigungsmail je Adresse in diesem Abstand */
export const MAIL_INTERVAL_MS = 10 * 60 * 1000

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const normalizeEmail = (e: string) => e.trim().toLowerCase()
export const isValidEmail = (e: string) => e.length >= 6 && e.length <= 254 && EMAIL_RE.test(e)

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

const union = (a: readonly Topic[], b: readonly Topic[]) => TOPICS.filter((x) => a.includes(x) || b.includes(x))

export const subscribe = mutation({
  args: {
    email: v.string(),
    topics: v.array(topic),
    locale: v.union(v.literal('de'), v.literal('en')),
    source: v.optional(v.string()),
    /** Honigtopf: bleibt bei Menschen leer */
    website: v.optional(v.string()),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    if (args.website?.trim()) return { ok: true as const }
    const email = normalizeEmail(args.email)
    if (!isValidEmail(email)) throw new Error('invalid_email')
    const topics = union(args.topics, [])
    if (!topics.length) throw new Error('no_topic')
    const now = Date.now()
    const source = (args.source ?? 'website').slice(0, 40)

    const existing = await ctx.db
      .query('newsletter')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique()

    // Schon bestätigt und nichts Neues: keine Mail
    if (existing?.status === 'confirmed' && topics.every((x) => existing.topics.includes(x))) return { ok: true as const }

    let row = existing
    if (!row) {
      const id = await ctx.db.insert('newsletter', {
        email,
        topics: [],
        requested: topics,
        status: 'pending',
        locale: args.locale,
        confirmToken: randomToken(),
        unsubToken: randomToken(),
        source,
        createdAt: now,
      })
      row = (await ctx.db.get(id))!
    } else {
      await ctx.db.patch(row._id, { requested: union(row.requested, topics), locale: args.locale })
    }

    if (row.mailedAt && now - row.mailedAt < MAIL_INTERVAL_MS) return { ok: true as const }
    await ctx.db.patch(row._id, { mailedAt: now })
    await ctx.scheduler.runAfter(0, internal.newsletterMail.sendConfirmation, {
      email,
      locale: args.locale,
      topics: union(row.requested, topics),
      confirmToken: row.confirmToken,
      unsubToken: row.unsubToken,
    })
    return { ok: true as const }
  },
})

/** Link aus der Bestätigungsmail: angefragte Themen werden bestätigt */
export const confirm = mutation({
  args: { token: v.string() },
  returns: v.union(v.object({ ok: v.literal(true), topics: v.array(topic) }), v.object({ ok: v.literal(false) })),
  handler: async (ctx, { token }) => {
    const t = token.trim()
    if (!t || t.length > 128) return { ok: false as const }
    const row = await ctx.db
      .query('newsletter')
      .withIndex('by_confirmToken', (q) => q.eq('confirmToken', t))
      .unique()
    if (!row) return { ok: false as const }
    const topics = union(row.status === 'unsubscribed' ? [] : row.topics, row.requested)
    if (!topics.length) return { ok: false as const }
    await ctx.db.patch(row._id, { status: 'confirmed', topics, requested: [], confirmedAt: Date.now(), unsubscribedAt: undefined })
    return { ok: true as const, topics }
  },
})

/** Abmeldelink aus jeder Mail: alle Themen ab, idempotent */
export const unsubscribe = mutation({
  args: { token: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { token }) => {
    const t = token.trim()
    if (!t || t.length > 128) return { ok: false }
    const row = await ctx.db
      .query('newsletter')
      .withIndex('by_unsubToken', (q) => q.eq('unsubToken', t))
      .unique()
    if (!row) return { ok: false }
    if (row.status !== 'unsubscribed')
      await ctx.db.patch(row._id, { status: 'unsubscribed', topics: [], requested: [], unsubscribedAt: Date.now() })
    return { ok: true }
  },
})

/** Für den Versand zum Launch oder bei Neuigkeiten (Dashboard oder Skript): nur Bestätigte */
export const recipients = internalQuery({
  args: { topic },
  handler: async (ctx, { topic: tp }) => {
    const rows = await ctx.db.query('newsletter').collect()
    return rows
      .filter((r) => r.status === 'confirmed' && r.topics.includes(tp))
      .map((r) => ({ email: r.email, locale: r.locale, unsubToken: r.unsubToken }))
  },
})
