import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

/**
 * MIDI vom Klavier, auf zwei Wegen hinter einer Schnittstelle:
 * - Web MIDI in Chrome/Edge (Mac, Windows, Android)
 * - natives Plugin `PianoMidi` (CoreMIDI) in der iOS-App, weil Safari kein Web MIDI kann
 */

export type MidiKind = 'native' | 'web' | null

export interface MidiNote {
  midi: number
  velocity: number
  /** Zeitbasis performance.now() */
  tMs: number
}

export interface MidiHandle {
  stop(): void
}

interface PianoMidiPlugin {
  start(): Promise<{ devices: string[] }>
  stop(): Promise<void>
  showBluetooth(): Promise<void>
  addListener(event: 'noteOn', fn: (d: { note: number; velocity: number }) => void): Promise<PluginListenerHandle>
  addListener(event: 'devices', fn: (d: { devices: string[] }) => void): Promise<PluginListenerHandle>
}

const PianoMidi = registerPlugin<PianoMidiPlugin>('PianoMidi')

export function midiKind(): MidiKind {
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PianoMidi')) return 'native'
  if (typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator) return 'web'
  return null
}

/** Bluetooth-MIDI koppeln (nur iOS-App: Apples eigener Dialog) */
export const canPairBluetooth = () => midiKind() === 'native'
export const showBluetoothPairing = () => PianoMidi.showBluetooth()

export async function connectMidi(
  onNote: (n: MidiNote) => void,
  onDevices: (names: string[]) => void,
): Promise<MidiHandle> {
  const kind = midiKind()
  if (kind === 'native') {
    const subs = await Promise.all([
      // Ankunftszeit im Web-Teil; die Host-Zeitstempel von CoreMIDI abzubilden ist STU-1228
      PianoMidi.addListener('noteOn', (d) => onNote({ midi: d.note, velocity: d.velocity, tMs: performance.now() })),
      PianoMidi.addListener('devices', (d) => onDevices(d.devices)),
    ])
    const { devices } = await PianoMidi.start()
    onDevices(devices)
    return {
      stop() {
        subs.forEach((s) => void s.remove())
        void PianoMidi.stop()
      },
    }
  }
  if (kind === 'web') {
    const access = await navigator.requestMIDIAccess()
    const bind = () => {
      const names: string[] = []
      access.inputs.forEach((input) => {
        names.push(input.name ?? 'MIDI')
        input.onmidimessage = (e) => {
          const d = e.data
          if (!d || d.length < 3) return
          // Zeitstempel der Quelle (gleiche Zeitbasis wie performance.now()), nicht die Ankunftszeit
          if ((d[0] & 0xf0) === 0x90 && d[2] > 0) onNote({ midi: d[1], velocity: d[2], tMs: e.timeStamp })
        }
      })
      onDevices(names)
    }
    access.onstatechange = bind
    bind()
    return {
      stop() {
        access.onstatechange = null
        access.inputs.forEach((i) => (i.onmidimessage = null))
      },
    }
  }
  throw new Error('Kein MIDI in diesem Browser')
}
