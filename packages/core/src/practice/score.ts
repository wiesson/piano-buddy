import type { Attempt } from '../sync/store'

/**
 * Bewertung eines Durchgangs neben „sauber“: Prozent der Schritte, die beim ersten Anschlag
 * richtig waren, und Sterne daraus. Vorbild sind Piano Marvel (Prozent und Bestwert) und
 * Melodics (1–3 Sterne): Kein Durchgang scheitert an einem einzigen falschen Ton.
 *
 * „Sauber“ (100 %, kein falscher Ton) bleibt das Kriterium für den Fortschritt (plan.ts);
 * Prozent und Sterne zeigen nur den Weg dorthin.
 */

export type Stars = 0 | 1 | 2 | 3

/** ★ ab 70 %, ★★ ab 90 %, ★★★ nur sauber */
export const STAR_PERCENT = [70, 90] as const

/** Anteil richtiger Schritte in Prozent, abgerundet: 100 % gibt es nur ohne Fehler */
export function percentOf(steps: number, missed: number): number {
  if (steps <= 0) return 100
  return Math.floor((100 * Math.max(0, steps - missed)) / steps)
}

export function starsFor(percent: number, clean: boolean): Stars {
  if (clean) return 3
  if (percent >= STAR_PERCENT[1]) return 2
  if (percent >= STAR_PERCENT[0]) return 1
  return 0
}

/**
 * Prozent eines gespeicherten Versuchs. Ältere Versuche haben kein Feld: sauber heißt 100 %,
 * sonst ist der Wert unbekannt (null) und zählt weder für den Bestwert noch fürs Lob.
 */
export function percentOfAttempt(a: Pick<Attempt, 'clean' | 'percent'>): number | null {
  if (a.clean) return 100
  return typeof a.percent === 'number' ? a.percent : null
}

export interface Best {
  percent: number
  stars: Stars
}

/** Bestwert einer Stufe aus ihren Versuchen; null, solange keiner einen bekannten Wert hat */
export function bestOf(attempts: Pick<Attempt, 'clean' | 'percent'>[]): Best | null {
  let percent = -1
  let stars: Stars = 0
  for (const a of attempts) {
    const p = percentOfAttempt(a)
    if (p === null) continue
    percent = Math.max(percent, p)
    stars = Math.max(stars, starsFor(p, a.clean)) as Stars
  }
  return percent < 0 ? null : { percent, stars }
}

export type Praise =
  /** Zum ersten Mal so viele Sterne auf dieser Stufe */
  | { kind: 'stars'; stars: Stars }
  /** Höherer Prozentwert als je zuvor (nur, wenn es schon einen Wert gab) */
  | { kind: 'best'; percent: number }
  /** Ein Takt, der bisher immer Fehler hatte, ist zum ersten Mal fehlerfrei */
  | { kind: 'bar'; bar: number }

export interface PassScore {
  clean: boolean
  percent: number
  missedBars: number[]
}

/**
 * Höchstens ein Lob pro Durchgang, und nur für etwas wirklich Neues. Reihenfolge: mehr Sterne
 * als je zuvor, dann neuer Bestwert, dann ein Takt, der zum ersten Mal ohne Fehler blieb.
 * `previous` sind die früheren Versuche derselben Stufe (ohne den aktuellen).
 */
export function praiseFor(previous: Pick<Attempt, 'clean' | 'percent' | 'missedBars'>[], current: PassScore): Praise | null {
  const best = bestOf(previous)
  const stars = starsFor(current.percent, current.clean)
  if (stars > 0 && stars > (best?.stars ?? 0)) return { kind: 'stars', stars }
  if (best && current.percent > best.percent) return { kind: 'best', percent: current.percent }

  // Takt zum ersten Mal fehlerfrei: nur Versuche zählen, deren Takte bekannt sind (sauber heißt:
  // alle Takte fehlerfrei). Unter mehreren nimm den ersten.
  if (current.clean || previous.some((a) => a.clean)) return null
  const known = previous.flatMap((a) => (a.missedBars ? [a.missedBars] : []))
  const misses = new Map<number, number>()
  for (const bars of known) for (const b of bars) misses.set(b, (misses.get(b) ?? 0) + 1)
  // Neu ist ein Takt nur, wenn er in jedem bekannten Versuch Fehler hatte (der Auftakt 0 zählt nicht)
  const candidates = [...misses.entries()]
    .filter(([b, n]) => b > 0 && n === known.length && !current.missedBars.includes(b))
    .sort((x, y) => x[0] - y[0])
  return candidates.length ? { kind: 'bar', bar: candidates[0][0] } : null
}
