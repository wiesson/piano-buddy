import { LESSONS, stagesFor, type Lesson } from '../../music/lessons'
import { CLEAN_GOAL } from '../../practice/goal'
import { store } from '../../sync/store'
import { DevicesDialog } from '../../sync/DevicesDialog'
import { t, localized } from '../../i18n'
import { Logo } from '../shared/icons'
import { Dots } from '../shared/Dots'
import { AboutDialog } from '../shared/AboutDialog'

/** Startseite: App-Leiste wie eine Tastenklappe, darunter der Lernpfad */
export function HomeScreen({ onOpen, synced }: { onOpen: (l: Lesson) => void; synced: boolean }) {
  const doneAll = (l: Lesson) => stagesFor(l).every((s) => store.cleanCount(l.id, s) >= CLEAN_GOAL)
  const next = LESSONS.find((l) => !doneAll(l))

  return (
    <div className="home">
      <header className="appbar">
        <span className="appbar-side">
          <AboutDialog />
        </span>
        <h1 className="appbar-brand">
          <Logo size={26} />
          <span>{t.appName}</span>
        </h1>
        <span className="appbar-side appbar-end">{synced && <DevicesDialog />}</span>
      </header>

      <p className="lede">{t.home.intro}</p>

      <ol className="path">
        {LESSONS.map((l, i) => (
          <LessonStep key={l.id} lesson={l} index={i} done={doneAll(l)} isNext={l === next} onOpen={onOpen} />
        ))}
      </ol>

      <footer className="hint">
        <p>{t.home.hint}</p>
      </footer>
    </div>
  )
}

/** Ein Knoten im Lernpfad: erledigt (Haken), als Nächstes (Messing) oder offen (Ring) */
function LessonStep({
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
    <li className={`step ${done ? 'done' : ''} ${isNext ? 'next' : ''}`}>
      <button className="lesson" onClick={() => onOpen(lesson)}>
        <span className="node" aria-hidden>
          {done ? '✓' : index + 1}
        </span>
        <span className="body">
          <span className="name">
            <span className="sr-only">{index + 1}. </span>
            {localized(lesson.title)}
            {isNext && <span className="next-tag">{t.home.next}</span>}
          </span>
          <span className="goal">{localized(lesson.goal)}</span>
        </span>
        <span className="mini-stages">
          {(['L', 'R', 'LR'] as const).map((s) =>
            stagesFor(lesson).includes(s) ? (
              <span key={s} className={`mini mini-${s}`}>
                <span className="mini-label">{t.stage[s]}</span>
                <Dots stage={s} clean={store.cleanCount(lesson.id, s)} />
              </span>
            ) : (
              <span key={s} className="mini mini-empty" aria-hidden />
            ),
          )}
        </span>
      </button>
    </li>
  )
}
