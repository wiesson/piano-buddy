import { stagesFor, type Lesson } from '@piano/core/music/lessons'
import { store } from '@piano/core/sync/store'
import { localized, t } from '@piano/core/i18n'
import { Dots } from '../shared/Dots'

/** Eine Zeile im Lernpfad: Nummer in Mono, Stück und Ziel, rechts die Punkte je Hand */
export function LessonRow({
  lesson,
  index,
  done,
  isNext,
  onOpen,
}: {
  lesson: Lesson
  index: number
  done: boolean
  isNext: boolean
  onOpen: (l: Lesson) => void
}) {
  return (
    <li className={`pb-step${done ? ' done' : ''}${isNext ? ' next' : ''}`}>
      <button type="button" className="pb-lesson" onClick={() => onOpen(lesson)}>
        <span className="pb-num" aria-hidden="true">
          {done ? '✓' : String(index + 1).padStart(2, '0')}
        </span>
        <span className="pb-lesson-body">
          <span className="pb-lesson-name">
            <span className="sr-only">{index + 1}. </span>
            {localized(lesson.title)}
            {isNext && <span className="next-tag">{t.home.next}</span>}
          </span>
          <span className="pb-lesson-goal">{localized(lesson.goal)}</span>
        </span>
        <span className="mini-stages">
          {(['L', 'R', 'LR'] as const).map((s) =>
            stagesFor(lesson).includes(s) ? (
              <span key={s} className={`mini mini-${s}`}>
                <span className="mini-label">{t.stage[s]}</span>
                <Dots stage={s} clean={store.cleanCount(lesson.id, s)} />
              </span>
            ) : (
              <span key={s} className="mini mini-empty" aria-hidden="true" />
            ),
          )}
        </span>
      </button>
    </li>
  )
}
