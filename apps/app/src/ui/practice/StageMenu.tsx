import { useState } from 'react'
import type { Stage } from '@piano/core/music/lessons'
import { CLEAN_GOAL } from '@piano/core/practice/goal'
import { dayKey } from '@piano/core/practice/plan'
import type { Best } from '@piano/core/practice/score'
import { TEMPO_LADDER, type Tempo } from '@piano/core/practice/tempo'
import { t } from '@piano/core/i18n'
import { Dots } from '@piano/ui/shared/Dots'
import { Stars } from '@piano/ui/shared/Stars'
import { PracticeSheet } from './PracticeSheet'

export const tempoLabel = (tp: Tempo) => (tp === 'wait' ? t.tempo.wait : t.tempo.percent(Math.round(tp * 100)))

/** „heute“, „morgen“, „in 3 Tagen“ für den Tag der nächsten Wiederholung */
function whenOf(due: string): string {
  const today = dayKey(Date.now())
  if (due <= today) return t.stages.today
  const [y, m, d] = due.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  const days = Math.round((new Date(y, m - 1, d, 12).getTime() - new Date(ty, tm - 1, td, 12).getTime()) / 86_400_000)
  return days === 1 ? t.stages.tomorrow : t.stages.inDays(days)
}

/**
 * Stufen-Chip unter dem Titel („Rechts ★★ ›“) und dahinter das Sheet mit allen Stufen: Punkte
 * (saubere Durchgänge), bester Durchgang, in welchem Tempo es schon sauber war, nächste
 * Wiederholung, dazu der Zielsatz des Stücks und „Anhören“. Ersetzt die Stufenwahl, die mit
 * Punkten und Sternen dauerhaft in der Kopfzeile stand.
 */
export function StageMenu({
  stages,
  stage,
  onChange,
  cleanCount,
  best,
  cleanTempos,
  due,
  goal,
  demo,
  onToggleDemo,
}: {
  stages: Stage[]
  stage: Stage
  onChange: (s: Stage) => void
  cleanCount: (s: Stage) => number
  best: (s: Stage) => Best | null
  /** Tempo-Stufen, in denen die Stufe schon sauber gespielt wurde */
  cleanTempos: (s: Stage) => Set<Tempo>
  /** Tag der nächsten Wiederholung (YYYY-MM-DD), null solange die Stufe nicht sitzt */
  due: (s: Stage) => string | null
  goal: string
  demo: boolean
  onToggleDemo: () => void
}) {
  const b = best(stage)
  const [open, setOpen] = useState(false)
  return (
    <PracticeSheet
      open={open}
      onOpenChange={setOpen}
      title={t.stages.title}
      triggerClassName={`stage-chip stage-${stage}`}
      triggerLabel={t.stages.open(t.stage[stage])}
      trigger={
        <>
          <span className={`hand-dots hand-${stage}`} aria-hidden="true" />
          <span>{t.stage[stage]}</span>
          {b?.stars ? <Stars n={b.stars} earnedOnly className="chip-stars" /> : null}
          <span className="chip-chev" aria-hidden="true">
            ›
          </span>
        </>
      }
    >
      <p className="stage-sheet-goal">{goal}</p>
      <div className="set-rows">
        {stages.map((s) => {
          const clean = cleanCount(s)
          const bs = best(s)
          const done = cleanTempos(s)
          const d = due(s)
          return (
            <button
              key={s}
              type="button"
              className="stage-row-item"
              aria-current={s === stage}
              onClick={() => (setOpen(false), onChange(s))}
            >
              <span className="stage-row-top">
                <span className="stage-row-name">
                  <span className={`hand-dots hand-${s}`} aria-hidden="true" />
                  {t.stage[s]}
                  <Dots stage={s} clean={Math.min(clean, CLEAN_GOAL)} />
                </span>
                {bs && (
                  <span className="stage-row-best">
                    {bs.stars ? <Stars n={bs.stars} earnedOnly /> : null}
                    {t.tempo.percent(bs.percent)}
                  </span>
                )}
              </span>
              <span className="mini-ladder" aria-label={t.tempo.label}>
                {TEMPO_LADDER.map((tp) => (
                  <span key={String(tp)} className={done.has(tp) ? 'done' : ''}>
                    {tempoLabel(tp)}
                  </span>
                ))}
              </span>
              <small className="stage-row-sub">
                {clean >= CLEAN_GOAL ? t.stages.sits : t.stages.cleanOf(clean, CLEAN_GOAL)}
                {d ? ` ${t.stages.review(whenOf(d))}` : ''}
              </small>
            </button>
          )
        })}
      </div>
      <div className="set-rows">
        <button type="button" className="menu-item listen-row" onClick={() => (setOpen(false), onToggleDemo())} aria-pressed={demo}>
          <span className="toggle-text">
            {demo ? t.stages.listenStop : t.stages.listen}
            <small>{t.stages.listenHint}</small>
          </span>
        </button>
      </div>
      <p className="stage-sheet-legend">{t.stages.legend}</p>
    </PracticeSheet>
  )
}
