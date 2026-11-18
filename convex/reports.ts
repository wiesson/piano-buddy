import { v } from 'convex/values'
import { internalQuery, mutation } from './_generated/server'
import { requireDevice } from './sync'

/**
 * Mikrofon-Messungen hochladen: nur Geräte, die die App kennt, und nur auf ausdrücklichen Tipp
 * („Messung senden“ im Lernmodus). Gelesen werden sie nur intern (npx convex run), nie von Geräten.
 */

const MAX_FILE = 25 * 1024 * 1024

export const uploadUrl = mutation({
  args: { token: v.string() },
  returns: v.string(),
  handler: async (ctx, { token }) => {
    await requireDevice(ctx, token)
    return await ctx.storage.generateUploadUrl()
  },
})

export const save = mutation({
  args: {
    token: v.string(),
    kind: v.string(),
    summary: v.string(),
    dataId: v.id('_storage'),
    audioId: v.optional(v.id('_storage')),
  },
  returns: v.id('micReports'),
  handler: async (ctx, { token, kind, summary, dataId, audioId }) => {
    const device = await requireDevice(ctx, token)
    if (summary.length > 8000 || kind.length > 40) throw new Error('Zu groß')
    for (const id of [dataId, audioId]) {
      if (!id) continue
      const meta = await ctx.db.system.get(id)
      if (!meta || meta.size > MAX_FILE) throw new Error('Datei fehlt oder ist zu groß')
    }
    return await ctx.db.insert('micReports', {
      profileId: device.profileId,
      createdAt: Date.now(),
      kind,
      summary,
      dataId,
      audioId,
    })
  },
})

/** Für die Auswertung: npx convex run reports:latest --prod */
export const latest = internalQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      id: v.id('micReports'),
      createdAt: v.number(),
      kind: v.string(),
      summary: v.string(),
      dataUrl: v.union(v.string(), v.null()),
      audioUrl: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db.query('micReports').withIndex('by_created').order('desc').take(limit ?? 10)
    return Promise.all(
      rows.map(async (r) => ({
        id: r._id,
        createdAt: r.createdAt,
        kind: r.kind,
        summary: r.summary,
        dataUrl: await ctx.storage.getUrl(r.dataId),
        audioUrl: r.audioId ? await ctx.storage.getUrl(r.audioId) : null,
      })),
    )
  },
})
