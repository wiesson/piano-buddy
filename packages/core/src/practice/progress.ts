import { LESSONS, stagesFor, type Lesson } from '../music/lessons'
import { store } from '../sync/store'
import { CLEAN_GOAL } from './goal'

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
