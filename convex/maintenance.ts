import { v } from 'convex/values'
import { internalMutation } from './_generated/server'
import { PAIR_WINDOW_MS } from './sync'

/** Wie lange das Protokoll der KI-Aufrufe bleibt */
export const AGENT_CALL_RETENTION_MS = 90 * 24 * 60 * 60 * 1000
const BATCH = 500

/**
 * Aufräumen, stündlich: abgelaufene Kopplungscodes, alte Zähler für Fehlversuche, Protokoll der
 * KI-Aufrufe älter als 90 Tage. Je Lauf höchstens 500 Zeilen pro Tabelle, der Rest beim nächsten.
 */
export const cleanup = internalMutation({
  args: {},
  returns: v.object({ codes: v.number(), failures: v.number(), calls: v.number() }),
  handler: async (ctx) => {
    const now = Date.now()
    const codes = await ctx.db
      .query('pairCodes')
      .withIndex('by_expires', (q) => q.lt('expiresAt', now))
      .take(BATCH)
    for (const r of codes) await ctx.db.delete(r._id)
    const failures = await ctx.db
      .query('pairFailures')
      .withIndex('by_window', (q) => q.lt('windowStart', now - PAIR_WINDOW_MS))
      .take(BATCH)
    for (const r of failures) await ctx.db.delete(r._id)
    const calls = await ctx.db
      .query('agentCalls')
      .withIndex('by_at', (q) => q.lt('at', now - AGENT_CALL_RETENTION_MS))
      .take(BATCH)
    for (const r of calls) await ctx.db.delete(r._id)
    return { codes: codes.length, failures: failures.length, calls: calls.length }
  },
})
