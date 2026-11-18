import { LESSONS, stagesFor, type Lesson } from '../music/lessons'
import { store } from '../sync/store'
import { CLEAN_GOAL } from './goal'
import { dailyPlan, dayKey, stageStates, streak, type StageState } from './plan'

/** Sitzen alle Stufen eines Stücks? */
export const lessonDone = (l: Lesson) => stagesFor(l).every((s) => store.cleanCount(l.id, s) >= CLEAN_GOAL)

/** Das erste Stück im Lernpfad, das noch nicht sitzt */
export const nextLesson = () => LESSONS.find((l) => !lessonDone(l))

/** Gelernte Stufen, alle Stufen, saubere Durchgänge insgesamt */
export function totals() {
  let total = 0
  let learned = 0
  let clean = 0
  for (const l of LESSONS)
    for (const s of stagesFor(l)) {
      const n = store.cleanCount(l.id, s)
      total++
      clean += n
      if (n >= CLEAN_GOAL) learned++
    }
  return { total, learned, clean }
}

let cache: { v: number; states: Map<string, StageState> } | null = null

/** Zustand aller Stufen, neu berechnet nur, wenn sich das Protokoll geändert hat */
export function currentStates() {
  const v = store.version()
  if (!cache || cache.v !== v) cache = { v, states: stageStates(store.attempts()) }
  return cache.states
}

/** Tagesplan und Serie für heute */
export function today() {
  const attempts = store.attempts()
  const day = dayKey(Date.now())
  return { plan: dailyPlan(attempts, day), streak: streak(attempts, day) }
}
