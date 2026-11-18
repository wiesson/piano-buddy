import type { Stage } from '@piano/core/music/lessons'
import { CLEAN_GOAL } from '@piano/core/practice/goal'
import { t } from '@piano/core/i18n'

/**
 * Saubere Durchgänge einer Stufe als Punkte in der Handfarbe (gefüllt = geschafft).
 * Gefestigt (an einem späteren Tag auf Anhieb sauber): Punkte in Gold.
 */
export function Dots({ stage, clean, firm = false }: { stage: Stage; clean: number; firm?: boolean }) {
  const label = firm ? `${t.practice.cleanOf(clean, CLEAN_GOAL)}, ${t.plan.firm}` : t.practice.cleanOf(clean, CLEAN_GOAL)
  return (
    <span className={`dots dots-${stage}${firm ? ' firm' : ''}`} aria-label={label}>
      {Array.from({ length: CLEAN_GOAL }, (_, i) => (
        <i key={i} className={i < clean ? 'on' : ''} />
      ))}
    </span>
  )
}
