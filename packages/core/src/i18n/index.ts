import { de, type Messages } from './de'
import { en } from './en'
import type { Locale, Localized } from './localized'

export type { Locale, Localized }

const KEY = 'pianobuddy.lang'

function detect(): Locale {
  // Die Bausteine-Seite (/sink) ist das Schaufenster für X: immer Englisch
  if (typeof location !== 'undefined' && /\/sink\/?$/.test(location.pathname)) return 'en'
  try {
    const stored = localStorage.getItem(KEY)
    if (stored === 'de' || stored === 'en') return stored
  } catch {
    /* Speicher gesperrt: Browsersprache gilt */
  }
  if (typeof navigator === 'undefined') return 'de'
  const first = navigator.languages?.[0] ?? navigator.language ?? ''
  return first.toLowerCase().startsWith('de') ? 'de' : 'en'
}

/** Aktive Sprache: auf /sink Englisch, sonst gespeicherte Wahl, sonst Browsersprache (Deutsch für deutsche Browser, sonst Englisch). */
export const locale: Locale = detect()

export const t: Messages = locale === 'de' ? de : en

if (typeof document !== 'undefined') document.documentElement.lang = locale

/** Sprache wählen, merken und neu laden. */
export function setLocale(l: Locale) {
  try {
    localStorage.setItem(KEY, l)
  } catch {
    /* ohne Speicher keine Dauerwahl */
  }
  location.reload()
}

export const localized = (x: Localized): string => x[locale]
