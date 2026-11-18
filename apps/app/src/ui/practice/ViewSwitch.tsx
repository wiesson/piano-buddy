import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from '@ui-sdk/react/segmented-control'
import { t } from '@piano/core/i18n'

/** Wie das Stück erscheint: fallende Noten, beides übereinander (Zwischenschritt) oder Noten */
export type ViewMode = 'roll' | 'both' | 'sheet'
export const VIEW_MODES: readonly ViewMode[] = ['roll', 'both', 'sheet']

/**
 * Sichtbarer Umschalter in der Werkzeugleiste. „Beides“ ist der Zwischenschritt von den Tasten
 * zu den Noten: oben das Klaviersystem, darunter dieselben Töne als fallende Balken, mit einem
 * gemeinsamen Cursor. So lernt das Auge, welche Note zu welcher Taste gehört.
 */
export function ViewSwitch({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <SegmentedControl
      className="view-switch"
      aria-label={t.practice.viewMode}
      value={value}
      onValueChange={(v) => v && onChange(v as ViewMode)}
    >
      <SegmentedControlIndicator className="view-switch-indicator" />
      {VIEW_MODES.map((m) => (
        <SegmentedControlItem key={m} value={m} className="view-switch-item">
          {t.practice.viewModes[m]}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  )
}
