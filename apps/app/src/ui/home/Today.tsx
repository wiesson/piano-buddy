import type { Stage } from '@piano/core/music/lessons'
import { LESSONS } from '@piano/core/music/lessons'
import { today } from '@piano/core/practice/progress'
import { localized, t } from '@piano/core/i18n'

/**
 * „Heute“ oben auf der App-Startseite: Serie, fällige Wiederholungen, der nächste Schritt im
 * Lernpfad. Bestimmt aus dem Protokoll (über Convex auf allen Geräten gleich).
 */
export function Today({ onOpen }: { onOpen: (lessonId: string, stage: Stage) => void }) {
  const { plan, streak } = today()
  const streakText = streak.days
    ? `${t.plan.streak(streak.days)}${streak.today ? '' : ` · ${t.plan.streakOpen}`}`
    : t.plan.streakStart
  return (
    <section className="today" aria-labelledby="today-title">
      <div className="today-head">
        <h2 id="today-title" className="today-title">
          {t.plan.today}
        </h2>
        <span className={`today-streak${streak.today ? ' on' : ''}`}>{streakText}</span>
      </div>
      <ol className="today-list">
        {plan.items.map((it) => {
          const lesson = LESSONS.find((l) => l.id === it.lessonId)
          if (!lesson) return null
          const state = it.done ? (it.kind === 'review' ? (it.passed ? t.plan.passed : t.plan.retry) : '✓') : ''
          return (
            <li key={`${it.kind}:${it.lessonId}:${it.stage}`}>
              <button
                type="button"
                className={`today-item today-${it.kind}${it.done ? ' done' : ''}`}
                onClick={() => onOpen(it.lessonId, it.stage)}
              >
                <span className="today-kind">{it.kind === 'review' ? t.plan.review : t.plan.focus}</span>
                <span className="today-name">
                  {localized(lesson.title)} <span className={`today-stage stage-${it.stage}`}>{t.stage[it.stage]}</span>
                </span>
                <span className="today-state">{state}</span>
              </button>
            </li>
          )
        })}
      </ol>
      {plan.complete && <p className="today-done">{t.plan.complete}</p>}
    </section>
  )
}
