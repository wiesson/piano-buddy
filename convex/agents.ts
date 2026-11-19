import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { mutation, query, type MutationCtx } from './_generated/server'
import { parseAgentKey, sameHash, sha256 } from './keys'
import { AGENT_SCOPES, agentScope, type AgentScope } from './schema'
import { requireDevice } from './sync'

/**
 * KI-Zugänge (STU-1272). Verwaltet werden sie nur von einem Gerät des Profils (Geräteschlüssel);
 * benutzt werden sie vom MCP-Server (STU-1276), der den Schlüssel der KI durchreicht und hier
 * prüfen lässt. Prüfung und Rechte liegen in Convex, weil Convex direkt aufrufbar ist.
 */

export const MAX_ACTIVE_KEYS = 5
export const MAX_DAYS = 365
const DAY_MS = 24 * 60 * 60 * 1000
/** „Zuletzt benutzt“ höchstens einmal pro Minute schreiben */
const LAST_USED_EVERY_MS = 60 * 1000

const isActive = (k: Doc<'agentKeys'>, now: number) => !k.revokedAt && k.expiresAt > now

const keyView = v.object({
  id: v.id('agentKeys'),
  name: v.string(),
  scopes: v.array(agentScope),
  createdAt: v.number(),
  expiresAt: v.number(),
  lastUsedAt: v.union(v.number(), v.null()),
  expired: v.boolean(),
})

/** Zugänge des Profils, neueste zuerst. Widerrufene verschwinden, abgelaufene bleiben sichtbar. */
export const list = query({
  args: { token: v.string() },
  returns: v.union(v.null(), v.array(keyView)),
  handler: async (ctx, { token }) => {
    const device = await requireDevice(ctx, token).catch(() => null)
    if (!device) return null
    const now = Date.now()
    const keys = await ctx.db
      .query('agentKeys')
      .withIndex('by_profile', (q) => q.eq('profileId', device.profileId))
      .order('desc')
      .collect()
    return keys
      .filter((k) => !k.revokedAt)
      .map((k) => ({
        id: k._id,
        name: k.name,
        scopes: k.scopes,
        createdAt: k.createdAt,
        expiresAt: k.expiresAt,
        lastUsedAt: k.lastUsedAt ?? null,
        expired: k.expiresAt <= now,
      }))
  },
})

/**
 * Neuen Zugang anlegen. Das Geheimnis erzeugt das Gerät selbst und schickt nur dessen SHA-256;
 * den fertigen Schlüssel `pb_<id>_<Geheimnis>` setzt das Gerät aus der Antwort zusammen und zeigt
 * ihn genau einmal. Der Server kennt ihn nie.
 */
export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    scopes: v.array(agentScope),
    days: v.number(),
    secretHash: v.string(),
  },
  returns: v.object({ id: v.id('agentKeys'), expiresAt: v.number() }),
  handler: async (ctx, { token, name, scopes, days, secretHash }) => {
    const device = await requireDevice(ctx, token)
    const cleanName = name.trim().slice(0, 40)
    if (!cleanName) throw new Error('Name fehlt')
    const cleanScopes = AGENT_SCOPES.filter((s) => scopes.includes(s))
    if (!cleanScopes.length) throw new Error('Mindestens ein Recht wählen')
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) throw new Error('Ablauf: 1 bis 365 Tage')
    if (!/^[0-9a-f]{64}$/.test(secretHash)) throw new Error('Ungültiger Schlüssel')

    const now = Date.now()
    const existing = await ctx.db
      .query('agentKeys')
      .withIndex('by_profile', (q) => q.eq('profileId', device.profileId))
      .collect()
    if (existing.filter((k) => isActive(k, now)).length >= MAX_ACTIVE_KEYS)
      throw new Error(`Höchstens ${MAX_ACTIVE_KEYS} KI-Zugänge gleichzeitig`)

    const expiresAt = now + days * DAY_MS
    const id = await ctx.db.insert('agentKeys', {
      profileId: device.profileId,
      name: cleanName,
      scopes: cleanScopes,
      secretHash,
      createdAt: now,
      expiresAt,
    })
    return { id, expiresAt }
  },
})

/** Zugang widerrufen: gilt sofort nicht mehr. Auch abgelaufene lassen sich so wegräumen. */
export const revoke = mutation({
  args: { token: v.string(), id: v.id('agentKeys') },
  returns: v.null(),
  handler: async (ctx, { token, id }) => {
    const device = await requireDevice(ctx, token)
    const key = await ctx.db.get(id)
    if (!key || key.profileId !== device.profileId) throw new Error('Unbekannter Zugang')
    if (!key.revokedAt) await ctx.db.patch(id, { revokedAt: Date.now() })
    return null
  },
})

// ---------- Prüfung für den MCP-Server ----------

export type AgentDenied = {
  ok: false
  code: 'unauthorized' | 'revoked' | 'expired' | 'forbidden' | 'bad_request'
  message: string
}
export type AgentAccess = {
  ok: true
  keyId: Id<'agentKeys'>
  profileId: Id<'profiles'>
  name: string
  scopes: AgentScope[]
  expiresAt: number
  callId: Id<'agentCalls'>
}

const TOOL = /^[a-z][a-z0-9_]{0,39}$/

const deny = (code: AgentDenied['code'], message: string): AgentDenied => ({ ok: false, code, message })

/**
 * Die eine Prüfung für jeden KI-Aufruf: Schlüssel → Profil, Rechte, Zugang. Schreibt dabei das
 * Protokoll (ohne Inhalte) und „zuletzt benutzt“. Gibt eine Ablehnung zurück statt zu werfen:
 * Ein Fehler würde die Mutation samt Protokolleintrag zurückrollen. Aufrufer geben die Ablehnung
 * als `{ ok: false, code, message }` an die KI weiter.
 *
 * Ein Werkzeug, das nach der Prüfung selbst scheitert, trägt sein Ergebnis mit `setCallOutcome` nach.
 */
export async function checkAgent(
  ctx: MutationCtx,
  key: string,
  { tool, scope }: { tool: string; scope?: AgentScope },
): Promise<AgentAccess | AgentDenied> {
  const parsed = parseAgentKey(key)
  if (!parsed) return deny('unauthorized', 'This key is not valid. Ask the user to create a new access key in Piano Buddy.')
  const id = ctx.db.normalizeId('agentKeys', parsed.id)
  const row = id ? await ctx.db.get(id) : null
  if (!row) return deny('unauthorized', 'This key is not valid. Ask the user to create a new access key in Piano Buddy.')

  const now = Date.now()
  const log = (outcome: string) =>
    ctx.db.insert('agentCalls', {
      profileId: row.profileId,
      keyId: row._id,
      at: now,
      tool: TOOL.test(tool) ? tool : 'invalid',
      outcome,
    })

  // Ohne richtiges Geheimnis kein Protokolleintrag: Wer nur die ID kennt, soll nichts schreiben können
  if (!sameHash(await sha256(parsed.secret), row.secretHash)) {
    return deny('unauthorized', 'This key is not valid. Ask the user to create a new access key in Piano Buddy.')
  }
  if (row.revokedAt) {
    await log('revoked')
    return deny('revoked', 'The user has revoked this access. Ask them to create a new one if they want to continue.')
  }
  if (row.expiresAt <= now) {
    await log('expired')
    return deny('expired', 'This access has expired. Ask the user to create a new one in Piano Buddy.')
  }
  if (!TOOL.test(tool)) {
    await log('bad_request')
    return deny('bad_request', 'Unknown tool name.')
  }
  if (scope && !row.scopes.includes(scope)) {
    await log('forbidden')
    return deny('forbidden', `This access does not allow "${scope}". Ask the user to create an access with that permission.`)
  }

  const callId = await log('ok')
  if (!row.lastUsedAt || now - row.lastUsedAt >= LAST_USED_EVERY_MS) await ctx.db.patch(row._id, { lastUsedAt: now })
  return {
    ok: true,
    keyId: row._id,
    profileId: row.profileId,
    name: row.name,
    scopes: row.scopes,
    expiresAt: row.expiresAt,
    callId,
  }
}

/** Ergebnis eines Werkzeugs nachtragen (z. B. „invalid_piece“), weiterhin ohne Inhalte */
export async function setCallOutcome(ctx: MutationCtx, callId: Id<'agentCalls'>, outcome: string) {
  await ctx.db.patch(callId, { outcome: outcome.slice(0, 40) })
}

/**
 * Für den MCP-Server: prüft einen Schlüssel für ein Werkzeug (optional mit nötigem Recht) und
 * sagt, wer das ist und was der Zugang darf. Grundlage für `get_context`; die Werkzeuge selbst
 * rufen `checkAgent` in ihrer eigenen Mutation auf.
 */
export const verify = mutation({
  args: { key: v.string(), tool: v.string(), scope: v.optional(agentScope) },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      data: v.object({
        profileId: v.id('profiles'),
        name: v.string(),
        scopes: v.array(agentScope),
        expiresAt: v.number(),
      }),
    }),
    v.object({ ok: v.literal(false), code: v.string(), message: v.string() }),
  ),
  handler: async (ctx, { key, tool, scope }) => {
    const access = await checkAgent(ctx, key, { tool, scope })
    if (!access.ok) return access
    const { profileId, name, scopes, expiresAt } = access
    return { ok: true as const, data: { profileId, name, scopes, expiresAt } }
  },
})
