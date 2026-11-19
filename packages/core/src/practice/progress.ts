import { stagesFor, type Lesson, type Stage } from '../music/lessons'
import { LEVELS, PATH, parseVersionId, versionId, versionsOf } from '../music/versions'
import { store } from '../sync/store'
import { CLEAN_GOAL } from './goal'
import { dailyPlan, dayKey, stageStates, streak, type StageState } from './plan'
import { popFocusItem, popLessonsIn, popNext, popUnlocked } from './popPlan'
import { popPrefs } from '../music/popPrefs'

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

/** Zustand aller Stufen (Lernpfad und geübte Pop-Zellen), neu berechnet nur, wenn sich das Protokoll geändert hat */
export function currentStates() {
  const v = store.version()
  if (!cache || cache.v !== v) {
    const attempts = store.attempts()
    cache = { v, states: stageStates(attempts, [...PATH, ...popLessonsIn(attempts)]) }
  }
  return cache.states
}

/** Tagesplan und Serie für heute: Lernpfad, Wiederholungen (auch Pop), dazu der nächste Pop-Schritt */
export function today() {
  const attempts = store.attempts()
  const day = dayKey(Date.now())
  const plan = dailyPlan(attempts, day, [...PATH, ...popLessonsIn(attempts)], PATH)
  const pop = popFocusItem(attempts, day, popPrefs.patterns())
  if (pop) plan.items.push(pop)
  return { plan: { items: plan.items, complete: plan.items.every((i) => i.done) }, streak: streak(attempts, day) }
}

/** Die nächsten Pop-Übungen und ob wir den Pop-Pfad schon empfehlen */
export function popToday() {
  const attempts = store.attempts()
  const patterns = popPrefs.patterns()
  return { next: popNext(attempts, patterns), unlocked: popUnlocked(attempts, patterns) }
}
