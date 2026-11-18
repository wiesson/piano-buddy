import { Popover, PopoverContent, PopoverTrigger } from '@ui-sdk/react/popover'
import { Toggle } from '@ui-sdk/react/toggle'
import { MoreIcon } from '@piano/ui/shared/icons'
import { t } from '@piano/core/i18n'
import { ViewSwitch, type ViewMode } from './ViewSwitch'

/**
 * „…“-Menü oben rechts: alles, was man nicht ständig braucht. Ansicht (Fallend · Beides · Noten),
 * was auf Blöcken und Tasten steht, Fingertasten, Klaviatur unter den Noten, Mikrofon einlernen,
 * Diagnose senden.
 */
export function ViewMenu(p: {
  mode: ViewMode
  onMode: (v: ViewMode) => void
  showNames: boolean
  onShowNames: (v: boolean) => void
  showFingers: boolean
  onShowFingers: (v: boolean) => void
  fingerKeys: boolean
  onFingerKeys: (v: boolean) => void
  sheetKeys: boolean
  onSheetKeys: (v: boolean) => void
  onCalibrate?: () => void
  diagnostics: boolean
  onDiagnostics?: (v: boolean) => void
}) {
  return (
    <Popover>
      <PopoverTrigger className="icon-button" aria-label={t.practice.more}>
        <MoreIcon />
      </PopoverTrigger>
      <PopoverContent className="popover more-menu" side="bottom" align="end" sideOffset={6}>
        <p className="menu-label">{t.practice.viewMode}</p>
        <ViewSwitch value={p.mode} onChange={p.onMode} />
        <span className="menu-sep" aria-hidden="true" />
        {p.mode === 'sheet' && (
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
        {(p.onCalibrate || p.onDiagnostics) && <span className="menu-sep" aria-hidden="true" />}
        {p.onCalibrate && (
          <button type="button" className="menu-item" onClick={p.onCalibrate}>
            {t.calib.title}
          </button>
        )}
        {p.onDiagnostics && (
          <Toggle className="toggle toggle-row" pressed={p.diagnostics} onPressedChange={p.onDiagnostics}>
            <span className="toggle-text">
              {t.practice.diagnostics}
              <small>{t.practice.diagnosticsHint}</small>
            </span>
          </Toggle>
        )}
      </PopoverContent>
    </Popover>
  )
}
