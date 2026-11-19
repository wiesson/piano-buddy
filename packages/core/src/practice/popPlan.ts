import { elementsOf, newElements, type ElementId } from '../music/elements'
import { stagesFor, type Lesson } from '../music/lessons'
import { DEFAULT_PATTERNS, frontier, parseCell, popLesson, startCell, type Cell, type Next, type PatternId } from '../music/pop'
import { PATH } from '../music/versions'
import type { Attempt } from '../sync/store'
import { coveredByHigher, dayKey, stageStates, stateFor, type PlanItem } from './plan'

/**
 * Die Pop-Spur im Fortschritt: welche Zellen gemeistert sind, was der Nutzer insgesamt kann
 * (Elemente aus Lernpfad und Pop), was als Nächstes dran ist und der Pop-Schritt in „Heute“.
 * Reine Funktionen über dem Protokoll, wie plan.ts.
 */

/** Pop-Übungen, die im Protokoll vorkommen */
export function popLessonsIn(attempts: Attempt[]): Lesson[] {
  const ids = [...new Set(attempts.map((a) => a.lessonId).filter((id) => id.startsWith('pop-')))]
  return ids.map(parseCell).filter((c): c is Cell => !!c).map(popLesson)
}

function learnedLessons(attempts: Attempt[]): Lesson[] {
  const lessons = [...PATH, ...popLessonsIn(attempts)]
  const states = stageStates(attempts, lessons)
  return lessons.filter((l) =>
    stagesFor(l).every((s) => (stateFor(states, l.id, s)?.level ?? -1) >= 0 || coveredByHigher(states, l.id, s)),
  )
}

/** Was der Nutzer kann: die Elemente aller Schritte, deren Stufen sitzen */
export function knownElements(attempts: Attempt[]): Set<ElementId> {
  return new Set(learnedLessons(attempts).flatMap((l) => elementsOf(l)))
}

/** Pop-Zellen, in denen alle Stufen sitzen */
export function masteredCells(attempts: Attempt[]): Cell[] {
  return learnedLessons(attempts)
    .map((l) => parseCell(l.id))
    .filter((c): c is Cell => !!c)
}

/** Die nächsten 2–4 Pop-Zellen für diesen Stand */
export function popNext(attempts: Attempt[], patterns: readonly PatternId[] = DEFAULT_PATTERNS): Next[] {
  return frontier(masteredCells(attempts), knownElements(attempts), patterns)
}

/**
 * Empfehlen wir den Pop-Pfad schon? Sobald der Einstieg höchstens ein neues Element verlangt
 * (nach „Vier Akkorde“), oder sobald jemand selbst damit angefangen hat.
 */
export function popUnlocked(attempts: Attempt[], patterns: readonly PatternId[] = DEFAULT_PATTERNS): boolean {
  if (attempts.some((a) => a.lessonId.startsWith('pop-'))) return true
  return newElements(knownElements(attempts), popLesson(startCell(patterns))).length <= 1
}

/** Der Pop-Schritt in „Heute“: bestimmt aus dem Stand vor heute, erledigt mit einem sauberen Durchgang heute */
export function popFocusItem(attempts: Attempt[], today: string, patterns: readonly PatternId[] = DEFAULT_PATTERNS): PlanItem | null {
  const before = attempts.filter((a) => dayKey(a.at) < today)
  if (!popUnlocked(before, patterns)) return null
  const next = popNext(before, patterns)[0]
  if (!next) return null
  const lesson = popLesson(next.cell)
  const states = stageStates(before, [lesson])
  const stage = stagesFor(lesson).find((s) => (stateFor(states, lesson.id, s)?.level ?? -1) < 0) ?? 'LR'
  const done = attempts.some((a) => dayKey(a.at) === today && a.lessonId === lesson.id && a.stage === stage && a.clean)
  return { lessonId: lesson.id, stage, kind: 'focus', track: 'pop', done }
}
