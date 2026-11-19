import { DEFAULT_PATTERNS, PATTERNS, type PatternId } from './pop'

/**
 * Welche Begleitmuster im Pop-Pfad sind: Arne wählt sie am Klavier aus (Seite „Party-Pianist“),
 * bis dahin gilt die Vorauswahl. Liegt auf dem Gerät; mindestens drei bleiben gewählt.
 */
const KEY = 'pianobuddy.popPatterns'
export const MIN_PATTERNS = 3

let cache: PatternId[] | null = null
let version = 0
const listeners = new Set<() => void>()

function read(): PatternId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (Array.isArray(raw)) {
      const list = PATTERNS.filter((p) => raw.includes(p))
      if (list.length >= MIN_PATTERNS) return list
    }
  } catch {
    /* ohne Speicher die Vorauswahl */
  }
  return [...DEFAULT_PATTERNS]
}

export const popPrefs = {
  patterns(): PatternId[] {
    if (!cache) cache = read()
    return cache
  },
  /** Muster an- oder abwählen; unter drei bleibt die Auswahl stehen */
  toggle(p: PatternId) {
    const cur = popPrefs.patterns()
    const next = cur.includes(p) ? cur.filter((x) => x !== p) : PATTERNS.filter((x) => x === p || cur.includes(x))
    if (next.length < MIN_PATTERNS) return false
    cache = next
    version++
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* gilt bis zum Neuladen */
    }
    listeners.forEach((l) => l())
    return true
  },
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  },
  version: () => version,
}
