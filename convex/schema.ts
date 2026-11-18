import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Ohne Konten: Ein Übe-Profil gehört den Geräten, die es kennen. Jedes Gerät hat einen eigenen
 * geheimen Schlüssel (nur sein SHA-256 liegt hier). Weitere Geräte kommen per Kopplungscode dazu.
 */
export const attemptFields = {
  attemptId: v.string(), // vom Gerät erzeugt, macht das Hochladen wiederholbar
  at: v.number(), // Zeitpunkt (ms seit 1970), vom Gerät
  lessonId: v.string(),
  stage: v.union(v.literal('L'), v.literal('R'), v.literal('LR')),
  clean: v.boolean(),
  wrong: v.number(),
  unverified: v.number(), // Töne, die das Mikrofon nicht sicher prüfen konnte
  source: v.string(), // mic | midi | touch | keys (überwiegende Eingabe)
  durationMs: v.number(),
}

export default defineSchema({
  profiles: defineTable({ createdAt: v.number() }),
  devices: defineTable({
    profileId: v.id('profiles'),
    tokenHash: v.string(),
    label: v.string(),
    createdAt: v.number(),
  })
    .index('by_tokenHash', ['tokenHash'])
    .index('by_profile', ['profileId']),
  pairCodes: defineTable({
    profileId: v.id('profiles'),
    codeHash: v.string(),
    expiresAt: v.number(),
  }).index('by_codeHash', ['codeHash']),
  // Mikrofon-Messungen, die jemand ausdrücklich schickt (Lernmodus → „Messung senden“), damit die
  // Erkennung besser wird. Messwerte und Aufnahme liegen als Dateien im Speicher.
  micReports: defineTable({
    profileId: v.id('profiles'),
    createdAt: v.number(),
    kind: v.string(),
    summary: v.string(),
    dataId: v.id('_storage'),
    audioId: v.optional(v.id('_storage')),
  }).index('by_created', ['createdAt']),
  attempts: defineTable({ profileId: v.id('profiles'), ...attemptFields })
    .index('by_profile', ['profileId', 'at'])
    .index('by_profile_attempt', ['profileId', 'attemptId']),
})
