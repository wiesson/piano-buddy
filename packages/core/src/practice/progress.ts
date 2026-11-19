import { stagesFor, type Lesson, type Stage } from '../music/lessons'
import { LEVELS, PATH, parseVersionId, versionId, versionsOf } from '../music/versions'
import { store } from '../sync/store'
import { CLEAN_GOAL } from './goal'
import { dailyPlan, dayKey, stageStates, streak, type StageState } from './plan'

/** Sitzt die Stufe, in dieser Fassung oder in einer schwereren desselben Stücks? */
function stageDone(l: Lesson, s: Stage): boolean {
  const { pieceId, level } = parseVersionId(l.id)
  return LEVELS.slice(LEVELS.indexOf(level)).some((lv) => store.cleanCount(versionId(pieceId, lv), s) >= CLEAN_GOAL)
}

/** Sitzen alle Stufen einer Fassung (auch über eine schwerere Fassung desselben Stücks)? */
export const lessonDone = (l: Lesson) => stagesFor(l).every((s) => stageDone(l, s))

/** Der erste Schritt im Lernpfad (Stück in einer Fassung), der noch nicht sitzt */
export const nextLesson = () => PATH.find((l) => !lessonDone(l))

/**
 * Die Fassung, die wir für ein Stück empfehlen: die leichteste, die noch nicht sitzt; sitzt
 * alles, das Original. Der Nutzer darf jede wählen.
 */
export function recommendedVersion(pieceId: string): Lesson {
  const vs = versionsOf(pieceId)
  return vs.find((l) => !lessonDone(l)) ?? vs[vs.length - 1]
}

/** Gelernte Stufen, alle Stufen (über alle Fassungen im Lernpfad), saubere Durchgänge insgesamt */
export function totals() {
  let total = 0
  let learned = 0
  let clean = 0
  for (const l of PATH)
    for (const s of stagesFor(l)) {
      total++
      clean += store.cleanCount(l.id, s)
      if (stageDone(l, s)) learned++
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
