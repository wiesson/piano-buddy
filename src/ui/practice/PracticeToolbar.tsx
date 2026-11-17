import { RestartIcon } from '../shared/icons'
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
      {/* Hochkant: Umbruch nach den Eingängen, zweite Zeile Vorspielen und Neustart */}
      <span className="tools-break" aria-hidden />
      <button className={`toggle ${p.demo ? 'on' : ''}`} onClick={p.onToggleDemo}>
        {p.demo ? t.practice.demoStop : t.practice.demo}
      </button>
      <span className="spacer" />
      <button className="icon-button" onClick={p.onRestart} disabled={!p.canRestart} aria-label={t.practice.restart}>
        <RestartIcon />
      </button>
    </footer>
  )
}
