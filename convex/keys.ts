/**
 * Schlüssel prüfen, ohne Datenbank. Zwei getrennte Arten:
 * - Geräteschlüssel: 32 Zufallsbytes base64url (43 Zeichen), vom Gerät erzeugt. Nie mit `pb_` vorn.
 * - KI-Schlüssel: `pb_<Convex-ID>_<Geheimnis>`, Geheimnis wie ein Geräteschlüssel (43 Zeichen).
 * Ein Schlüssel ist immer genau eine Art: Geräte-Prüfungen lehnen `pb_` ab, KI-Prüfungen alles andere.
 */

export async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const AGENT_KEY_PREFIX = 'pb_'

/** Geräteschlüssel: lang genug, damit er nicht zu erraten ist, und nie wie ein KI-Schlüssel. */
export const validDeviceToken = (t: string) => /^[A-Za-z0-9_-]{40,128}$/.test(t) && !t.startsWith(AGENT_KEY_PREFIX)

/** KI-Schlüssel zerlegen. Convex-IDs enthalten keinen Unterstrich, das Geheimnis darf welche haben. */
export function parseAgentKey(key: string): { id: string; secret: string } | null {
  const m = /^pb_([A-Za-z0-9]{2,64})_([A-Za-z0-9_-]{43})$/.exec(key.trim())
  return m ? { id: m[1], secret: m[2] } : null
}

/** Vergleich ohne frühen Ausstieg (gleich lange Hex-Hashes) */
export function sameHash(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
