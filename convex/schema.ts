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
  // Neu ab Bewertung in Prozent; ältere Versuche haben die Felder nicht
  percent: v.optional(v.number()), // Schritte beim ersten Anschlag richtig, 0–100
  missedBars: v.optional(v.array(v.number())), // Takte mit Fehlern
  tempo: v.optional(v.number()), // Mitspiel-Modus: Anteil des Stück-Tempos; fehlt im Warte-Modus
  timing: v.optional(v.array(v.union(v.number(), v.null()))), // je Ton: Abweichung in ms (null = verpasst)
  held: v.optional(v.array(v.union(v.number(), v.null()))), // je Ton: gehaltener Anteil in % (null = nicht gemessen)
}

/** Rechte eines KI-Zugangs: Fortschritt lesen, Stücke anlegen */
export const AGENT_SCOPES = ['progress.read', 'pieces.write'] as const
export type AgentScope = (typeof AGENT_SCOPES)[number]
export const agentScope = v.union(v.literal('progress.read'), v.literal('pieces.write'))

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
    /** Gerät, das den Code angeboten hat: Wird es entfernt, verfallen seine Codes mit. */
    deviceId: v.optional(v.id('devices')),
  })
    .index('by_codeHash', ['codeHash'])
    .index('by_device', ['deviceId'])
    .index('by_expires', ['expiresAt']),
  /**
   * Fehlversuche beim Einlösen von Kopplungscodes, je Zeitfenster. key ist „global“ oder
   * „device:<Hash des Schlüssels>“. Ein falscher Code lässt sich keinem Code zuordnen, daher
   * zählt der Server je einlösendem Gerät und zusätzlich über alle zusammen.
   */
  pairFailures: defineTable({
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
  })
    .index('by_key', ['key'])
    .index('by_window', ['windowStart']),
  /**
   * KI-Zugänge: eine KI (über den MCP-Server) darf mit diesem Schlüssel auf das Profil zugreifen,
   * nur mit den gewählten Rechten und nur bis zum Ablauf. Der Schlüssel `pb_<_id>_<Geheimnis>`
   * entsteht auf dem Gerät und wird genau einmal angezeigt; hier liegt nur SHA-256 des Geheimnisses.
   * Getrennt von `devices`: Ein KI-Schlüssel ist nie ein Geräteschlüssel und umgekehrt.
   */
  agentKeys: defineTable({
    profileId: v.id('profiles'),
    name: v.string(),
    scopes: v.array(agentScope),
    secretHash: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  }).index('by_profile', ['profileId']),
  /** Protokoll je Aufruf eines KI-Zugangs, ohne Inhalte: wann, welcher Zugang, welches Werkzeug, Ergebnis. */
  agentCalls: defineTable({
    profileId: v.id('profiles'),
    keyId: v.id('agentKeys'),
    at: v.number(),
    tool: v.string(),
    outcome: v.string(),
  })
    .index('by_key', ['keyId', 'at'])
    .index('by_at', ['at']),
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
  /**
   * Launch-Liste und Neuigkeiten: Anmeldung von der Website mit Double-Opt-in. Erst nach dem
   * Klick auf den Link in der Bestätigungsmail ist jemand angemeldet (confirmed); pending ohne
   * Bestätigung bekommt nichts. Abmelden geht über den Link in jeder Mail.
   */
  newsletter: defineTable({
    email: v.string(),
    /** Bestätigte Themen */
    topics: v.array(v.union(v.literal('launch'), v.literal('updates'))),
    /** Angefragt, aber noch nicht per Link bestätigt */
    requested: v.array(v.union(v.literal('launch'), v.literal('updates'))),
    status: v.union(v.literal('pending'), v.literal('confirmed'), v.literal('unsubscribed')),
    locale: v.union(v.literal('de'), v.literal('en')),
    confirmToken: v.string(),
    unsubToken: v.string(),
    source: v.string(),
    createdAt: v.number(),
    /** Letzte Bestätigungsmail (Sperre gegen Mail-Bomben auf fremde Adressen) */
    mailedAt: v.optional(v.number()),
    confirmedAt: v.optional(v.number()),
    unsubscribedAt: v.optional(v.number()),
  })
    .index('by_email', ['email'])
    .index('by_confirmToken', ['confirmToken'])
    .index('by_unsubToken', ['unsubToken']),
})
