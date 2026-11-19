import { Link } from '@tanstack/react-router'
import type { Lesson } from '@piano/core/music/lessons'
import { popLesson, type Next } from '@piano/core/music/pop'
import { lessonDone, popToday } from '@piano/core/practice/progress'
import { elementName, t } from '@piano/core/i18n'
import { LessonRow } from '@piano/ui/home/LessonRow'

/** Elemente zum Anzeigen: der Anfangsbereich einer Hand ist keine Neuigkeit */
export const shown = (es: readonly string[]) => es.filter((e) => !e.endsWith(':mid'))

/** „Neu: Achtel, Offbeat.“ oder „Nichts Neues …“ für eine nächste Pop-Übung */
export function freshText(n: Pick<Next, 'fresh'>) {
  const es = shown(n.fresh)
  return es.length ? t.pop.fresh(es.map(elementName).join(', ')) : t.pop.nothingNew
}

/** Die Übung als Zeile: statt des Ziels steht da, was neu ist (sobald wir den Pfad empfehlen) */
export function nextLesson(n: Next, unlocked: boolean): Lesson {
  const l = popLesson(n.cell)
  if (!unlocked) return l
  const text = freshText(n)
  return { ...l, goal: { de: text, en: text } }
}

/**
 * Pop-Pfad auf der Startseite: die 2–4 nächsten Übungen (je eine Achse weiter als das, was sitzt),
 * dazu der Weg zu allen Übungen und zur Musterwahl.
 */
export function PopSection({ onOpen }: { onOpen: (l: Lesson) => void }) {
  const { next, unlocked } = popToday()
  return (
    <section className="app-home-section" aria-labelledby="app-pop">
      <h2 id="app-pop" className="pb-h2">
        {t.pop.section}
      </h2>
      <p className="pb-note">{unlocked ? t.pop.sectionNote : t.pop.locked}</p>
      <ol className="pb-path">
        {next.map((n, i) => {
          const l = nextLesson(n, unlocked)
          return <LessonRow key={l.id} lesson={l} index={i} done={lessonDone(l)} isNext={unlocked && i === 0} onOpen={onOpen} />
        })}
      </ol>
      <p className="pb-note">
        <Link to="/pop">{t.pop.all}</Link>
      </p>
    </section>
  )
}
