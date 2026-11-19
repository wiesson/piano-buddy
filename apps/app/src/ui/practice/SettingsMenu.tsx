import { Toggle } from '@ui-sdk/react/toggle'
import type { MicStatus } from '@piano/core/audio/mic'
import { MicIcon, MidiIcon, MoreIcon } from '@piano/ui/shared/icons'
import { t } from '@piano/core/i18n'
import { canPairBluetooth, showBluetoothPairing } from '../../input/midi'
import { MicMeter } from './MicMeter'
import { PracticeSheet } from './PracticeSheet'
import type { MidiState } from './useMidiInput'
import { ViewSwitch, type ViewMode } from './ViewSwitch'
import { KeyHelpSwitch, type KeyHelp } from './KeyHelpSwitch'

/**
 * „…“ oben rechts: alles, was man nicht ständig braucht, in Gruppen. Ansicht, Eingang (MIDI und
 * Mikrofon), Metronom, was auf den Noten steht, und unter „Mehr“ Seltenes (Fingertasten,
 * Mikrofon einlernen, Diagnose).
 *
 * Der Eingang steht fest am Knopf, als Zeichen ohne Text: MIDI-Buchse (durchgestrichen, wenn
 * eingeschaltet, aber kein Klavier da ist) und Mikrofon. So sieht man immer, was zuhört.
 */
export function SettingsMenu(p: {
  mode: ViewMode
  onMode: (v: ViewMode) => void
  keyHelp: KeyHelp
  onKeyHelp: (v: KeyHelp) => void
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
  onCalibrate?: () => void
  diagnostics: boolean
  onDiagnostics?: (v: boolean) => void
}) {
  const listening = p.micStatus === 'listening' || p.micStatus === 'calibrating'
  const midiLive = p.midi.state === 'on' && p.midi.devices.length > 0
  const midiLost = p.midi.state === 'on' && !p.midi.devices.length
  // Nur was man wissen muss: welches Klavier, oder dass keins da ist
  const midiText =
    p.midi.state === 'connecting'
      ? t.practice.midi.connecting
      : p.midi.state === 'on'
        ? p.midi.devices.length
          ? p.midi.devices.join(', ')
          : t.practice.midi.noDevice
        : null
  const inputLabel = [
    p.midi.state !== 'off' ? (midiLive ? t.settings.inputMidiLive : t.settings.inputMidiLost) : '',
    listening ? t.settings.inputMic : '',
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <PracticeSheet
      title={t.settings.title}
      triggerClassName="icon-button more-trigger"
      triggerLabel={inputLabel ? `${t.settings.title} (${inputLabel})` : t.settings.title}
      trigger={
        <>
          {p.midi.state !== 'off' && (
            <span className={`input-icon${midiLost ? ' lost' : ''}`}>
              <MidiIcon lost={midiLost} />
            </span>
          )}
          {listening && (
            <span className="input-icon">
              <MicIcon />
            </span>
          )}
          <MoreIcon />
        </>
      }
    >
      <div className="set-group">
        <p className="set-label">{t.settings.view}</p>
        <ViewSwitch value={p.mode} onChange={p.onMode} />
      </div>

      <div className="set-group">
        <p className="set-label">{t.settings.keyHelp}</p>
        <KeyHelpSwitch value={p.keyHelp} onChange={p.onKeyHelp} />
        <small className="set-hint">{t.settings.keyHelpHint[p.keyHelp]}</small>
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
              {' '}
              {midiText && <small>{midiText}</small>}
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
              {' '}
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
          <Toggle className="toggle toggle-row" pressed={p.fingerKeys} onPressedChange={p.onFingerKeys}>
            <span className="toggle-text">
              {t.practice.fingerKeys}
              {' '}
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
                {' '}
                <small>{t.practice.diagnosticsHint}</small>
              </span>
            </Toggle>
          )}
        </div>
      </div>
    </PracticeSheet>
  )
}
