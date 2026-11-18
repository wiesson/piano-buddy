import { Toggle } from '@ui-sdk/react/toggle'
import type { MicStatus } from '@piano/core/audio/mic'
import { MoreIcon } from '@piano/ui/shared/icons'
import { t } from '@piano/core/i18n'
import { canPairBluetooth, showBluetoothPairing } from '../../input/midi'
import { MicMeter } from './MicMeter'
import { PracticeSheet } from './PracticeSheet'
import type { MidiState } from './useMidiInput'
import { ViewSwitch, type ViewMode } from './ViewSwitch'

/**
 * „…“ oben rechts: alles, was man nicht ständig braucht, in Gruppen. Ansicht, Eingang (MIDI und
 * Mikrofon, früher als Knöpfe in der unteren Leiste), Metronom, was auf den Noten steht, und
 * unter „Mehr“ Seltenes (Klaviatur unter den Noten, Fingertasten, Mikrofon einlernen, Diagnose).
 * Ein Punkt am Knopf zeigt, dass ein Eingang läuft.
 */
export function SettingsMenu(p: {
  mode: ViewMode
  onMode: (v: ViewMode) => void
  midi: MidiState
  onToggleMidi: () => void
  micStatus: MicStatus
  levelRef: React.RefObject<number>
  onToggleMic: () => void
  metronome: boolean
  onMetronome: (v: boolean) => void
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
  const listening = p.micStatus === 'listening' || p.micStatus === 'calibrating'
  const midiLive = p.midi.state === 'on' && p.midi.devices.length > 0
  const midiText =
    p.midi.state === 'off'
      ? t.settings.midiHint
      : p.midi.state === 'connecting'
        ? t.practice.midi.connecting
        : p.midi.devices.length
          ? `${p.midi.devices.join(', ')} · ${t.settings.midiHint}`
          : t.practice.midi.noDevice
  return (
    <PracticeSheet
      title={t.settings.title}
      triggerClassName="icon-button more-trigger"
      triggerLabel={t.settings.title}
      trigger={
        <>
          <MoreIcon />
          {(midiLive || listening) && <span className="input-dot" aria-hidden="true" />}
        </>
      }
    >
      <div className="set-group">
        <p className="set-label">{t.settings.view}</p>
        <ViewSwitch value={p.mode} onChange={p.onMode} />
      </div>

      <div className="set-group">
        <p className="set-label">{t.settings.input}</p>
        <div className="set-rows">
          <Toggle className="toggle toggle-row" pressed={p.midi.state !== 'off'} onPressedChange={p.onToggleMidi}>
            <span className="toggle-text">
              <span className="toggle-name">
                <span className={`midi-dot ${midiLive ? 'live' : ''}`} aria-hidden="true" />
                MIDI
              </span>
              <small>{midiText}</small>
            </span>
          </Toggle>
          {p.midi.state === 'on' && !p.midi.devices.length && canPairBluetooth() && (
            <button type="button" className="menu-item" onClick={() => void showBluetoothPairing()}>
              {t.practice.midi.pairBluetooth}
            </button>
          )}
          <Toggle className="toggle toggle-row" pressed={listening} onPressedChange={p.onToggleMic}>
            <span className="toggle-text">
              <span className="toggle-name">
                <MicMeter levelRef={p.levelRef} active={listening} />
                {p.micStatus === 'off' ? t.practice.mic.off : t.practice.mic[p.micStatus]}
              </span>
              <small>{t.settings.micHint}</small>
            </span>
          </Toggle>
        </div>
      </div>

      <div className="set-group">
        <p className="set-label">{t.settings.beat}</p>
        <div className="set-rows">
          <Toggle className="toggle toggle-row" pressed={p.metronome} onPressedChange={p.onMetronome}>
            <span className="toggle-text">
              {t.settings.metronome}
              <small>{t.settings.metronomeHint}</small>
            </span>
          </Toggle>
        </div>
      </div>

      <div className="set-group">
        <p className="set-label">{t.settings.onNotes}</p>
        <div className="set-rows">
          <Toggle className="toggle toggle-row" pressed={p.showNames} onPressedChange={p.onShowNames}>
            {t.practice.noteNames}
          </Toggle>
          <Toggle className="toggle toggle-row" pressed={p.showFingers} onPressedChange={p.onShowFingers}>
            {t.practice.fingers}
          </Toggle>
        </div>
      </div>

      <div className="set-group">
        <p className="set-label">{t.settings.more}</p>
        <div className="set-rows">
          {/* Immer da, damit nichts springt; abschaltbar ist die Klaviatur nur bei den Noten */}
          <Toggle
            className="toggle toggle-row"
            pressed={p.mode === 'sheet' ? p.sheetKeys : true}
            disabled={p.mode !== 'sheet'}
            onPressedChange={p.onSheetKeys}
          >
            {t.settings.keyboardUnderSheet}
          </Toggle>
          <Toggle className="toggle toggle-row" pressed={p.fingerKeys} onPressedChange={p.onFingerKeys}>
            <span className="toggle-text">
              {t.practice.fingerKeys}
              <small>{t.practice.fingerKeysHint}</small>
            </span>
          </Toggle>
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
        </div>
      </div>
    </PracticeSheet>
  )
}
