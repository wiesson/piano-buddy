import { Toggle } from '@ui-sdk/react/toggle'
import { Popover, PopoverContent, PopoverTrigger } from '@ui-sdk/react/popover'
import { RestartIcon, ViewIcon } from '../shared/icons'
import type { MicStatus } from '../../audio/mic'
import { canPairBluetooth, showBluetoothPairing } from '../../input/midi'
import { t } from '../../i18n'
import { MicMeter } from './MicMeter'
import type { MidiState } from './useMidiInput'

/** Untere Leiste der Übe-Seite: eine Zeile, seitlich wischbar, Reihenfolge immer gleich */
export function PracticeToolbar(p: {
  micStatus: MicStatus
  levelRef: React.RefObject<number>
  onToggleMic: () => void
  midi: MidiState
  onToggleMidi: () => void
  demo: boolean
  onToggleDemo: () => void
  showNames: boolean
  onShowNames: (v: boolean) => void
  showFingers: boolean
  onShowFingers: (v: boolean) => void
  canRestart: boolean
  onRestart: () => void
}) {
  const listening = p.micStatus === 'listening' || p.micStatus === 'calibrating'
  const midiLabel =
    p.midi.state === 'off'
      ? t.practice.midi.off
      : p.midi.state === 'connecting'
        ? t.practice.midi.connecting
        : (p.midi.devices[0] ?? t.practice.midi.noDevice)

  return (
    <footer className="bar tools">
      <button className={`mic ${p.micStatus}`} onClick={p.onToggleMic} aria-pressed={listening}>
        <MicMeter levelRef={p.levelRef} active={listening} />
        {t.practice.mic[p.micStatus]}
      </button>
      <button className={`midi ${p.midi.state}`} onClick={p.onToggleMidi} aria-pressed={p.midi.state !== 'off'}>
        <span className={`midi-dot ${p.midi.devices.length ? 'live' : ''}`} aria-hidden />
        {midiLabel}
      </button>
      {p.midi.state === 'on' && !p.midi.devices.length && canPairBluetooth() && (
        <button className="ghost" onClick={() => void showBluetoothPairing()}>
          {t.practice.midi.pairBluetooth}
        </button>
      )}
      <button className={`toggle ${p.demo ? 'on' : ''}`} onClick={p.onToggleDemo}>
        {p.demo ? t.practice.demoStop : t.practice.demo}
      </button>
      <span className="spacer" />
      <Popover>
        <PopoverTrigger className="toggle view-trigger" aria-label={t.practice.view}>
          <ViewIcon />
          <span className="view-label">{t.practice.view}</span>
        </PopoverTrigger>
        <PopoverContent className="popover" side="top" align="end" sideOffset={8}>
          <Toggle className="toggle toggle-row" pressed={p.showNames} onPressedChange={p.onShowNames}>
            {t.practice.noteNames}
          </Toggle>
          <Toggle className="toggle toggle-row" pressed={p.showFingers} onPressedChange={p.onShowFingers}>
            {t.practice.fingers}
          </Toggle>
        </PopoverContent>
      </Popover>
      <button className="icon-button" onClick={p.onRestart} disabled={!p.canRestart} aria-label={t.practice.restart}>
        <RestartIcon />
      </button>
    </footer>
  )
}
