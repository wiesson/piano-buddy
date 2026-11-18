import { LESSONS, stagesFor, type Lesson, type Stage } from '../music/lessons'
import type { Attempt } from '../sync/store'
import { CLEAN_GOAL } from './goal'

/**
 * Fortschrittssystem: aus dem Übungsprotokoll (synchronisiert über Convex) wird berechnet, was
 * sitzt, was gefestigt ist, was heute fällig ist und wie lang die Serie ist. Reine Funktionen,
 * nichts wird als Zähler gespeichert.
 *
 * Regeln (nach Lernforschung):
 * - Eine Stufe sitzt nach drei sauberen Durchgängen (Duke u. a. 2009: der Anteil korrekter
 *   Versuche sagt den Erfolg am nächsten Tag voraus, nicht die Übungszeit).
 * - Gefestigt ist sie erst, wenn an einem späteren Tag der erste Versuch sauber ist: Motorisches
 *   Lernen festigt sich über Nacht (Walker u. a. 2002).
 * - Danach kommt sie in wachsenden Abständen wieder (1, 3, 7, 21 Tage, Leitner-Prinzip). Am fälligen
 *   Tag entscheidet der erste Versuch: sauber rückt eine Stufe weiter, sonst ist sie morgen wieder dran.
 * - Die Serie zählt Tage mit mindestens einem sauberen Durchgang: Genauigkeit statt Menge.
 */

/** Abstände der Wiederholungen in Tagen; Stufe 0 = sitzt seit heute, morgen erste Prüfung */
export const INTERVALS = [1, 3, 7, 21] as const

export type StageStatus = 'new' | 'learning' | 'learned' | 'firm'

export interface StageState {
  lessonId: string
  stage: Stage
  /** saubere Durchgänge insgesamt */
  clean: number
  /** −1: sitzt noch nicht; 0: sitzt, nicht gefestigt; 1…: gefestigt, Wiederholungsstufe */
  level: number
  /** Tag der nächsten Wiederholung (YYYY-MM-DD), null solange die Stufe nicht sitzt */
  due: string | null
  status: StageStatus
  /** letzter Tag mit einem Versuch */
  lastDay: string | null
}

/** Kalendertag in der Zeitzone des Geräts */
export function dayKey(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d + n, 12).getTime())
}

const key = (lessonId: string, stage: Stage) => `${lessonId}:${stage}`

/** Zustand einer Stufe aus ihren Versuchen (ältester zuerst) */
function stateOf(lessonId: string, stage: Stage, attempts: Attempt[]): StageState {
  let clean = 0
  let level = -1
  let due: string | null = null
  let lastDay: string | null = null
  let i = 0
  while (i < attempts.length) {
    const day = dayKey(attempts[i].at)
    const today: Attempt[] = []
    while (i < attempts.length && dayKey(attempts[i].at) === day) today.push(attempts[i++])
    // Fälliger Tag (oder später): Der erste Versuch des Tages entscheidet
    if (level >= 0 && due && day >= due) {
      if (today[0].clean) {
        level = Math.min(level + 1, INTERVALS.length - 1)
        due = addDays(day, INTERVALS[level])
      } else {
        level = 0
        due = addDays(day, INTERVALS[0])
      }
    }
    for (const a of today) {
      if (!a.clean) continue
      clean++
      if (level < 0 && clean >= CLEAN_GOAL) {
        level = 0
        due = addDays(day, INTERVALS[0])
      }
    }
    lastDay = day
  }
  const status: StageStatus = level >= 1 ? 'firm' : level === 0 ? 'learned' : attempts.length ? 'learning' : 'new'
  return { lessonId, stage, clean, level, due, status, lastDay }
}

/** Zustand aller Stufen aller Stücke */
export function stageStates(attempts: Attempt[], lessons: Lesson[] = LESSONS): Map<string, StageState> {
  const byKey = new Map<string, Attempt[]>()
  for (const a of attempts) {
    const k = key(a.lessonId, a.stage)
    byKey.set(k, [...(byKey.get(k) ?? []), a])
  }
  const out = new Map<string, StageState>()
  for (const l of lessons)
    for (const s of stagesFor(l)) {
      const list = (byKey.get(key(l.id, s)) ?? []).sort((a, b) => a.at - b.at)
      out.set(key(l.id, s), stateOf(l.id, s, list))
    }
  return out
}

export const stateFor = (states: Map<string, StageState>, lessonId: string, stage: Stage) => states.get(key(lessonId, stage))

export interface PlanItem {
  lessonId: string
  stage: Stage
  kind: 'review' | 'focus'
  /** heute erledigt: Wiederholung mit erstem Versuch (sauber = gefestigt), Fokus mit sauberem Durchgang */
  done: boolean
  /** nur Wiederholung: erster Versuch heute war sauber */
  passed?: boolean
}

export interface DailyPlan {
  items: PlanItem[]
  /** Alles für heute erledigt */
  complete: boolean
}

/** Höchstens so viele Wiederholungen am Tag, dazu ein Schritt im Lernpfad */
export const MAX_REVIEWS = 2

/**
 * Tagesplan: bestimmt aus dem Stand vor heute (damit er sich nicht während des Übens verschiebt),
 * erledigt wird er mit den Versuchen von heute.
 */
export function dailyPlan(attempts: Attempt[], today: string, lessons: Lesson[] = LESSONS): DailyPlan {
  const before = attempts.filter((a) => dayKey(a.at) < today)
  const todays = attempts.filter((a) => dayKey(a.at) === today)
  const states = stageStates(before, lessons)
  const order = lessons.flatMap((l) => stagesFor(l).map((s) => key(l.id, s)))
  const todayOf = (k: string) => todays.filter((a) => key(a.lessonId, a.stage) === k)

  const reviews = order
    .map((k) => states.get(k)!)
    .filter((s) => s.level >= 0 && s.due !== null && s.due <= today)
    .sort((a, b) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : order.indexOf(key(a.lessonId, a.stage)) - order.indexOf(key(b.lessonId, b.stage))))
    .slice(0, MAX_REVIEWS)
    .map((s): PlanItem => {
      const t = todayOf(key(s.lessonId, s.stage))
      return { lessonId: s.lessonId, stage: s.stage, kind: 'review', done: t.length > 0, passed: t[0]?.clean }
    })

  const focusState = order.map((k) => states.get(k)!).find((s) => s.level < 0)
  const items = [...reviews]
  if (focusState) {
    const t = todayOf(key(focusState.lessonId, focusState.stage))
    items.push({ lessonId: focusState.lessonId, stage: focusState.stage, kind: 'focus', done: t.some((a) => a.clean) })
  }
  return { items, complete: items.every((i) => i.done) }
}

/** Serie: Tage in Folge mit mindestens einem sauberen Durchgang; heute zählt mit, sobald er da ist */
export function streak(attempts: Attempt[], today: string): { days: number; today: boolean } {
  const days = new Set(attempts.filter((a) => a.clean).map((a) => dayKey(a.at)))
  const hasToday = days.has(today)
  let n = 0
  let d = hasToday ? today : addDays(today, -1)
  while (days.has(d)) {
    n++
    d = addDays(d, -1)
  }
  return { days: n, today: hasToday }
}
