import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { HostClock } from '@piano/core/input/hostClock'

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

/** Haltepedal (CC64) getreten oder losgelassen; Zeitbasis performance.now() */
export interface MidiPedal {
  down: boolean
  tMs: number
}

export interface MidiHandle {
  stop(): void
}

interface PianoMidiPlugin {
  start(): Promise<{ devices: string[] }>
  stop(): Promise<void>
  showBluetooth(): Promise<void>
  keepAwake(o: { on: boolean }): Promise<void>
  /** t: Anschlag, sent: Absenden, beides Host-Zeit in ms (fehlt in älteren App-Versionen) */
  addListener(event: 'noteOn', fn: (d: { note: number; velocity: number; t?: number; sent?: number }) => void): Promise<PluginListenerHandle>
  addListener(event: 'noteOff', fn: (d: { note: number; t?: number; sent?: number }) => void): Promise<PluginListenerHandle>
  addListener(event: 'devices', fn: (d: { devices: string[] }) => void): Promise<PluginListenerHandle>
  /** Haltepedal (fehlt in älteren App-Versionen) */
  addListener(event: 'pedal', fn: (d: { down: boolean; t?: number; sent?: number }) => void): Promise<PluginListenerHandle>
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

/**
 * Display beim Üben anlassen. Im Browser genügt der Wake Lock; die iOS-App schaltet zusätzlich
 * den Leerlauf-Timer ab, weil der Wake Lock in der WebView nicht verlässlich greift.
 */
export const keepAwake = async (on: boolean) => {
  if (midiKind() !== 'native') return
  try {
    await PianoMidi.keepAwake({ on })
  } catch {
    /* ältere App-Version ohne diese Methode */
  }
}

export async function connectMidi(
  onNote: (n: MidiNote) => void,
  onDevices: (names: string[]) => void,
  onPedal?: (p: MidiPedal) => void,
): Promise<MidiHandle> {
  const kind = midiKind()
  if (kind === 'native') {
    const clock = new HostClock()
    const local = (d: { note: number; t?: number; sent?: number }, off: boolean) => {
      const now = performance.now()
      if (typeof d.t !== 'number' || typeof d.sent !== 'number') return now
      return off ? clock.noteOff(d.note, d.t, d.sent, now) : clock.noteOn(d.note, d.t, d.sent, now)
    }
    const subs = await Promise.all([
      // Zeitstempel von CoreMIDI, auf performance.now() umgerechnet (ältere App-Versionen ohne
      // Zeitstempel: Ankunftszeit)
      PianoMidi.addListener('noteOn', (d) => onNote({ midi: d.note, velocity: d.velocity, tMs: local(d, false) })),
      // Loslassen kommt als Anschlagstärke 0 (für die Haltedauer)
      PianoMidi.addListener('noteOff', (d) => onNote({ midi: d.note, velocity: 0, tMs: local(d, true) })),
      PianoMidi.addListener('devices', (d) => onDevices(d.devices)),
      PianoMidi.addListener('pedal', (d) => {
        const now = performance.now()
        const tMs = typeof d.t === 'number' && typeof d.sent === 'number' ? clock.toLocal(d.t, d.sent, now) : now
        onPedal?.({ down: d.down, tMs })
      }),
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
          const kind = d[0] & 0xf0
          if (kind === 0x90 && d[2] > 0) onNote({ midi: d[1], velocity: d[2], tMs: e.timeStamp })
          // Note-Off (0x8n, oder 0x9n mit Stärke 0): als Anschlagstärke 0 melden
          else if (kind === 0x80 || kind === 0x90) onNote({ midi: d[1], velocity: 0, tMs: e.timeStamp })
          // Haltepedal: ab 64 getreten
          else if (kind === 0xb0 && d[1] === 64) onPedal?.({ down: d[2] >= 64, tMs: e.timeStamp })
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
