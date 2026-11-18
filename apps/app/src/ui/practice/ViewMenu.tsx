import { Popover, PopoverContent, PopoverTrigger } from '@ui-sdk/react/popover'
import { Toggle } from '@ui-sdk/react/toggle'
import { ViewIcon } from '@piano/ui/shared/icons'
import { t } from '@piano/core/i18n'

/** Ansicht: was auf Blöcken und Tasten steht (Notennamen, Fingersätze) */
export function ViewMenu(p: {
  showNames: boolean
  onShowNames: (v: boolean) => void
  showFingers: boolean
  onShowFingers: (v: boolean) => void
  fingerKeys: boolean
  onFingerKeys: (v: boolean) => void
  sheet: boolean
  sheetKeys: boolean
  onSheetKeys: (v: boolean) => void
}) {
  return (
    <Popover>
      <PopoverTrigger className="icon-button" aria-label={t.practice.view}>
        <ViewIcon />
      </PopoverTrigger>
      <PopoverContent className="popover" side="bottom" align="end" sideOffset={6}>
        {p.sheet && (
          <Toggle className="toggle toggle-row" pressed={p.sheetKeys} onPressedChange={p.onSheetKeys}>
            {t.practice.keyboard}
          </Toggle>
        )}
        <Toggle className="toggle toggle-row" pressed={p.showNames} onPressedChange={p.onShowNames}>
          {t.practice.noteNames}
        </Toggle>
        <Toggle className="toggle toggle-row" pressed={p.showFingers} onPressedChange={p.onShowFingers}>
          {t.practice.fingers}
        </Toggle>
        <Toggle className="toggle toggle-row" pressed={p.fingerKeys} onPressedChange={p.onFingerKeys}>
          <span className="toggle-text">
            {t.practice.fingerKeys}
            <small>{t.practice.fingerKeysHint}</small>
          </span>
        </Toggle>
      </PopoverContent>
    </Popover>
  )
}
