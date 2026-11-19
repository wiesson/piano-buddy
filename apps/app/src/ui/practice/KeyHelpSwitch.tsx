import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from '@ui-sdk/react/segmented-control'
import { t } from '@piano/core/i18n'

/**
 * Klaviatur-Hilfe (STU-1281), unabhängig von der Ansicht: Die Klaviatur steht immer, nur ob und
 * wann die nächste Taste leuchtet, schaltet. „Noten lesen, Taste leuchtet mit“ ist eine Lernstufe,
 * „Noten ohne Hilfe“ eine Prüfung.
 */
export type KeyHelp = 'now' | 'delayed' | 'off'
export const KEY_HELPS: readonly KeyHelp[] = ['now', 'delayed', 'off']

export function KeyHelpSwitch({ value, onChange }: { value: KeyHelp; onChange: (v: KeyHelp) => void }) {
  return (
    <SegmentedControl
      className="view-switch"
      aria-label={t.settings.keyHelp}
      value={value}
      onValueChange={(v) => v && onChange(v as KeyHelp)}
    >
      <SegmentedControlIndicator className="view-switch-indicator" />
      {KEY_HELPS.map((m) => (
        <SegmentedControlItem key={m} value={m} className="view-switch-item">
          {t.settings.keyHelpModes[m]}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  )
}
