import type { Stage } from '@piano/core/music/lessons'
import { CLEAN_GOAL } from '@piano/core/practice/goal'
import { t } from '@piano/core/i18n'

/** Saubere Durchgänge einer Stufe als Punkte in der Handfarbe (gefüllt = geschafft) */
export function Dots({ stage, clean }: { stage: Stage; clean: number }) {
  return (
    <span className={`dots dots-${stage}`} aria-label={t.practice.cleanOf(clean, CLEAN_GOAL)}>
      {Array.from({ length: CLEAN_GOAL }, (_, i) => (
        <i key={i} className={i < clean ? 'on' : ''} />
      ))}
    </span>
  )
}
