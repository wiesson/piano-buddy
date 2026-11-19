import { useSyncExternalStore } from 'react'
import { CARRY_MS, WRONG_DELAY_MS } from '@piano/core/practice/session'

/**
 * Varianten des Übe-Gefühls (STU-1284), umschaltbar in der Debug-Ebene, ohne neuen Code
 * auszuliefern. A ist das bisherige Verhalten und bleibt Standard, bis Arne im Blindvergleich
 * gewählt hat. Gemerkt pro Gerät; ohne Debug-Ebene gilt, was zuletzt gewählt war (meist A).
 *
 * B, nach Recherche und Zweitmeinung (Ankündigung → Anschlag → Bestätigung):
 * - lit 'playable': Die Taste leuchtet, sobald der Schritt spielbar ist, nicht erst, wenn die
 *   Note an der Linie angekommen ist. Das „Jetzt“ bestimmt die Logik, nicht die Bewegung.
 * - hit 'green': Ein Treffer wird im nächsten Bild kräftig grün (statt weiß aufzublitzen).
 * - check: Beim halben Akkord bleiben getroffene Töne grün abgehakt, nur die fehlenden leuchten.
 * - help 'stuck': In den Noten zeigt sich die richtige Taste nach Zögern seit Beginn des
 *   Schritts oder sofort nach einem falschen Ton; Suchtöne schieben die Hilfe nicht hinaus.
 * - Nichts blockiert, nichts beschämt (Neothesia, PianoBooster, Quellcode gelesen, STU-1284):
 *   falsch nur leise (roter Rand statt voller Fläche), nachgefasste Akkordtöne zählen nicht,
 *   zu frühe Töne 500 ms gepuffert (Neothesia: 500 ms).
 */
export interface Variant {
  lit: 'arrive' | 'playable'
  hit: 'soft' | 'green'
  check: boolean
  help: 'idle' | 'stuck'
  /** Zögern bis zur Hilfe in den Noten (ms) */
  helpMs: number
  /** Falscher Ton: volle rote Fläche oder leiser roter Rand */
  wrong: 'red' | 'soft'
  /** Fristen des Warte-Modus (ms) und Nachsicht, siehe WaitOptions */
  carryMs: number
  wrongDelayMs: number
  strayDelay: boolean
  repeatOk: boolean
  /**
   * Spulen (STU-1288): frei (bleibt, wo man loslässt, Schwung, federnde Ränder) oder wie bis zum
   * 19.11.2026 (rastet auf den nächsten Taktanfang, kein Schwung). „bar“ nur zum Vergleich.
   */
  scrub: 'free' | 'bar'
}

export const VARIANT_A: Variant = {
  lit: 'arrive',
  hit: 'soft',
  check: false,
  help: 'idle',
  helpMs: 3000,
  wrong: 'red',
  carryMs: CARRY_MS,
  wrongDelayMs: WRONG_DELAY_MS,
  strayDelay: false,
  repeatOk: false,
  scrub: 'free',
}

export const VARIANT_B: Variant = {
  lit: 'playable',
  hit: 'green',
  check: true,
  help: 'stuck',
  helpMs: 2000,
  wrong: 'soft',
  carryMs: 500,
  wrongDelayMs: 500,
  strayDelay: false,
  repeatOk: true,
  scrub: 'free',
}

const KEY = 'pianobuddy.variant'
const BLIND_KEY = 'pianobuddy.variant.blind'

const same = (a: Variant, b: Variant) => (Object.keys(a) as (keyof Variant)[]).every((k) => a[k] === b[k])

/** Name der Variante: A, B oder eigene Mischung */
export const variantName = (v: Variant): 'A' | 'B' | '' => (same(v, VARIANT_A) ? 'A' : same(v, VARIANT_B) ? 'B' : '')

function read(): Variant {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return VARIANT_A
    const v = { ...VARIANT_A, ...(JSON.parse(raw) as Partial<Variant>) }
    return variantName(v) === 'A' ? VARIANT_A : variantName(v) === 'B' ? VARIANT_B : v
  } catch {
    return VARIANT_A
  }
}

let current = read()
let blind = (() => {
  try {
    return localStorage.getItem(BLIND_KEY) === '1'
  } catch {
    return false
  }
})()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export const getVariant = () => current

export function setVariant(v: Variant) {
  current = variantName(v) === 'A' ? VARIANT_A : variantName(v) === 'B' ? VARIANT_B : { ...v }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* privater Modus: gilt nur für diese Sitzung */
  }
  emit()
}

/** Blindvergleich: A oder B per Zufall, verdeckt bis zum Aufdecken */
export const isBlind = () => blind
export function setBlind(on: boolean) {
  blind = on
  if (on) setVariant(Math.random() < 0.5 ? VARIANT_A : VARIANT_B)
  try {
    localStorage.setItem(BLIND_KEY, on ? '1' : '0')
  } catch {
    /* egal */
  }
  emit()
}

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))

export function useVariant() {
  return useSyncExternalStore(subscribe, getVariant)
}
export function useBlind() {
  return useSyncExternalStore(subscribe, isBlind)
}
