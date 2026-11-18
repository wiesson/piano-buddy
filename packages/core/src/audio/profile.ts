import { A, HARMONICS, S, type Frame } from './detector'

/**
 * Klangprofile: wie ein Ton auf diesem Klavier, in diesem Raum, mit diesem Mikrofon ankommt.
 * Die feste Erkennung nimmt ein durchschnittliches Klavier an (kräftiger Grundton, fallende
 * Obertöne). Handy-Mikrofone und Digitalpiano-Lautsprecher geben Grundtöne in Mittel- und
 * Basslage oft schwach wieder; dann verwirft die feste Regel echte Töne als „Oktave darüber“.
 * Der Lernmodus nimmt jeden Ton zwei-, dreimal auf und merkt sich seine Teiltonform.
 * Alles bleibt auf dem Gerät (localStorage, wenige KB).
 */

export interface NoteProfile {
  /** Teiltöne 1..HARMONICS relativ zum stärksten (max = 1) */
  shape: number[]
  /** typische Salienz des Tons kurz nach dem Anschlag (für die Anzeige, nicht als Schwelle) */
  level: number
  takes: number
}

export interface MicProfile {
  name: string
  createdAt: string
  /** MIDI-Nummer → Profil */
  notes: Record<number, NoteProfile>
}

/** Nachschlagen je Ton; null = kein Profil, feste Regeln gelten */
export type ProfileLookup = (midi: number) => NoteProfile | null

const KEY = 'piano-buddy:mic-profile'

export function loadProfile(): MicProfile | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as MicProfile) : null
  } catch {
    return null
  }
}

export function saveProfile(p: MicProfile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // voller oder gesperrter Speicher: Profil gilt nur bis zum Neuladen
  }
}

export function clearProfile() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // egal
  }
}

/**
 * Profil eines Tons, sonst das des nächsten gemessenen Nachbarn bis zwei Halbtöne entfernt
 * (schwarze Tasten und Lücken klingen wie ihre Nachbarn). Weiter weg: keins.
 */
export function lookupFrom(p: MicProfile | null): ProfileLookup | null {
  if (!p || !Object.keys(p.notes).length) return null
  return (m) => p.notes[m] ?? p.notes[m - 1] ?? p.notes[m + 1] ?? p.notes[m - 2] ?? p.notes[m + 2] ?? null
}

/**
 * Teiltonform aus den Frames eines Anschlags: je Teilton der Median über die Frames, in denen
 * der Anschlag ganz im Fenster liegt (freshness klein), normiert auf den stärksten Teilton.
 */
export function takeShape(frames: Frame[], m: number): { shape: number[]; level: number } | null {
  const settled = frames.filter((f) => f.freshness < 2)
  const use = settled.length >= 3 ? settled : frames
  if (!use.length) return null
  const shape: number[] = []
  for (let h = 1; h <= HARMONICS; h++) {
    const vals = use.map((f) => A(f, m, h)).sort((a, b) => a - b)
    shape.push(vals[Math.floor(vals.length / 2)])
  }
  const max = Math.max(...shape)
  if (max <= 0) return null
  return { shape: shape.map((v) => v / max), level: Math.max(...use.map((f) => S(f, m))) }
}

/** Mehrere Anschläge eines Tons zu einem Profil mitteln */
export function mergeTakes(takes: { shape: number[]; level: number }[]): NoteProfile | null {
  if (!takes.length) return null
  const shape = Array.from({ length: HARMONICS }, (_, h) => takes.reduce((s, t) => s + t.shape[h], 0) / takes.length)
  const max = Math.max(...shape)
  const levels = takes.map((t) => t.level).sort((a, b) => a - b)
  return { shape: shape.map((v) => v / max), level: levels[Math.floor(levels.length / 2)], takes: takes.length }
}
