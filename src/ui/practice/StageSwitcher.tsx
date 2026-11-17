import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from '@ui-sdk/react/segmented-control'
import type { Stage } from '../../music/lessons'
import { CLEAN_GOAL } from '../../practice/goal'
import { t } from '../../i18n'

function Dots({ stage, clean }: { stage: Stage; clean: number }) {
  return (
    <span className={`dots dots-${stage}`} aria-label={t.practice.cleanOf(clean, CLEAN_GOAL)}>
      {Array.from({ length: CLEAN_GOAL }, (_, i) => (
        <i key={i} className={i < clean ? 'on' : ''} />
      ))}
    </span>
  )
}

/**
 * Wahl der Hand (Links, Rechts, Beide) mit Fortschrittspunkten. Hat ein Stück nur eine
 * Stufe, gibt es nichts zu wählen: dann ein schlichtes Etikett statt eines Umschalters.
 */
export function StageSwitcher({
  stages,
  stage,
  cleanCount,
  onChange,
}: {
  stages: Stage[]
  stage: Stage
  cleanCount: (s: Stage) => number
  onChange: (s: Stage) => void
}) {
  if (stages.length === 1) {
    return (
      <p className={`stage-badge stage-${stage}`}>
        <span>{t.stage[stage]}</span>
        <Dots stage={stage} clean={cleanCount(stage)} />
      </p>
    )
  }
  return (
    <SegmentedControl
      className="stages"
      aria-label={t.practice.hand}
      value={stage}
      onValueChange={(v) => v && onChange(v as Stage)}
    >
      <SegmentedControlIndicator className="stage-indicator" />
      {stages.map((s) => (
        <SegmentedControlItem key={s} value={s} className={`stage stage-${s}`}>
          <span>{t.stage[s]}</span>
          <Dots stage={s} clean={cleanCount(s)} />
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  )
}
