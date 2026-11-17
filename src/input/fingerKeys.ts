import type { Hand, ScoreNote } from '../music/lessons'

/**
 * Fingertasten: Die Computertastatur wird nach Fingern belegt statt nach Tönen.
 * Links A S D F G = kleiner Finger bis Daumen, rechts H J K L Ö = Daumen bis kleiner Finger
 * (physische Tasten, gleich auf QWERTZ und QWERTY). Geübt werden so die Fingermuster der
 * Lektionen: Reihenfolge, Unabhängigkeit der Finger, Zusammenspiel der Hände.
 */
export const FINGER_KEYS: Record<Hand, string[]> = {
  // Index = Finger − 1
  L: ['KeyG', 'KeyF', 'KeyD', 'KeyS', 'KeyA'],
  R: ['KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'],
}

export function keyToFinger(code: string): { hand: Hand; finger: number } | null {
  for (const hand of ['L', 'R'] as const) {
    const i = FINGER_KEYS[hand].indexOf(code)
    if (i >= 0) return { hand, finger: i + 1 }
  }
  return null
}

/**
 * Welcher Ton gehört gerade zu diesem Finger? Zuerst der aktuelle Schritt, sonst die letzte Note
 * dieses Fingers davor (die Hand liegt noch dort), sonst seine nächste Note danach.
 * Der falsche Finger ergibt so den falschen Ton, wie am Klavier.
 */
export function fingerToMidi(notes: ScoreNote[], beat: number, hand: Hand, finger: number): number | null {
  const own = notes.filter((n) => n.hand === hand && n.finger === finger)
  if (!own.length) return null
  const now = own.find((n) => Math.abs(n.start - beat) < 1e-6)
  if (now) return now.midi
  const before = own.filter((n) => n.start < beat).pop()
  if (before) return before.midi
  return own[0].midi
}
