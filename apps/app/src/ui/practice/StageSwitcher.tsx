import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from '@ui-sdk/react/segmented-control'
import type { Stage } from '@piano/core/music/lessons'
import { t } from '@piano/core/i18n'
import { Dots } from '@piano/ui/shared/Dots'
import { Stars } from '@piano/ui/shared/Stars'
import { CLEAN_GOAL } from '@piano/core/practice/goal'
import type { Best } from '@piano/core/practice/score'

/**
 * Wahl der Hand (Links, Rechts, Beide) mit Fortschrittspunkten. Hat ein Stück nur eine
 * Stufe, gibt es nichts zu wählen: dann ein schlichtes Etikett statt eines Umschalters.
 * Solange eine Stufe nicht sitzt, stehen dezent die besten Sterne daneben (der Weg dorthin).
 */
export function StageSwitcher({
  stages,
  stage,
  cleanCount,
  onChange,
  best,
}: {
  stages: Stage[]
  stage: Stage
  cleanCount: (s: Stage) => number
  onChange: (s: Stage) => void
  best?: (s: Stage) => Best | null
}) {
  /** Punkte, daneben (nur solange die Stufe nicht sitzt) die besten Sterne */
  const marks = (s: Stage) => {
    const b = best?.(s)
    const dots = <Dots stage={s} clean={cleanCount(s)} />
    if (!b?.stars || cleanCount(s) >= CLEAN_GOAL) return dots
    return (
      <span className="stage-marks">
        {dots}
        <Stars n={b.stars} earnedOnly className="stage-stars" />
      </span>
    )
  }
  if (stages.length === 1) {
    return (
      <p className={`stage-badge stage-${stage}`}>
        <span>{t.stage[stage]}</span>
        {marks(stage)}
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
          {marks(s)}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  )
}
