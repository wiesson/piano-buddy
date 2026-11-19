import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { HostClock } from '@piano/core/input/hostClock'
import { CAPS, type InputEvent, type InputSource } from '@piano/core/input/events'
import { midiEvent } from '@piano/core/input/midiMessage'

/**
 * MIDI vom Klavier als Eingabequelle (STU-1224), auf zwei Wegen hinter derselben Schnittstelle:
 * - Web MIDI in Chrome/Edge (Mac, Windows, Android)
 * - natives Plugin `PianoMidi` (CoreMIDI) in der iOS-App, weil Safari kein Web MIDI kann
 *
 * Beide liefern Anschlag mit Stärke, Loslassen und Haltepedal, mit dem Zeitstempel der Quelle
 * in performance.now()-Zeit. Welche Geräte da sind, melden sie über `onDevices`.
 */

export type MidiKind = 'native' | 'web' | null

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

/** MIDI als Eingabequelle für diese Umgebung; null, wenn es hier kein MIDI gibt */
export function createMidiSource(onDevices: (names: string[]) => void): InputSource | null {
  const kind = midiKind()
  if (kind === 'native') return new NativeMidiSource(onDevices)
  if (kind === 'web') return new WebMidiSource(onDevices)
  return null
}

abstract class MidiSource implements InputSource {
  readonly kind = 'midi' as const
  readonly caps = CAPS.midi
  private subs = new Set<(e: InputEvent) => void>()
  constructor(protected onDevices: (names: string[]) => void) {}
  abstract start(): Promise<void>
  abstract stop(): void
  subscribe(fn: (e: InputEvent) => void) {
    this.subs.add(fn)
    return () => void this.subs.delete(fn)
  }
  protected emit(e: InputEvent) {
    for (const fn of this.subs) fn(e)
  }
}

/** Web MIDI: Jede Meldung kommt vollständig, mit dem Zeitstempel der Quelle (event.timeStamp) */
class WebMidiSource extends MidiSource {
  private access: MIDIAccess | null = null
  /** Eigener Empfänger je Quelle: Trennen entfernt nur ihn, nie den einer neueren Verbindung */
  private onMessage = (e: MIDIMessageEvent) => {
    const ev = midiEvent(e.data, e.timeStamp)
    if (ev) this.emit(ev)
  }

  async start() {
    const access = await navigator.requestMIDIAccess()
    this.access = access
    // Neue Geräte (Kabel eingesteckt, Bluetooth verbunden) binden sich beim Statuswechsel an;
    // derselbe Empfänger zweimal angemeldet zählt einmal
    const bind = () => {
      const names: string[] = []
      access.inputs.forEach((input) => {
        names.push(input.name ?? 'MIDI')
        input.addEventListener('midimessage', this.onMessage)
      })
      this.onDevices(names)
    }
    access.addEventListener('statechange', bind)
    this.unbind = () => access.removeEventListener('statechange', bind)
    bind()
  }

  private unbind = () => {}

  stop() {
    const access = this.access
    this.access = null
    if (!access) return
    this.unbind()
    access.inputs.forEach((i) => i.removeEventListener('midimessage', this.onMessage))
  }
}

/**
 * iOS-App: CoreMIDI im Plugin liest die Bytes (auch Running Status) und meldet fertige
 * Ereignisse mit Host-Zeit; die Host-Uhr rechnet sie auf performance.now() um, sodass die
 * Laufzeit über die Capacitor-Brücke nicht zählt. Ältere App-Versionen ohne Zeitstempel: Ankunft.
 */
class NativeMidiSource extends MidiSource {
  private handles: PluginListenerHandle[] = []

  async start() {
    const clock = new HostClock()
    const local = (d: { note?: number; t?: number; sent?: number }, kind: 'on' | 'off' | 'pedal') => {
      const now = performance.now()
      if (typeof d.t !== 'number' || typeof d.sent !== 'number') return now
      if (kind === 'on') return clock.noteOn(d.note!, d.t, d.sent, now)
      if (kind === 'off') return clock.noteOff(d.note!, d.t, d.sent, now)
      return clock.toLocal(d.t, d.sent, now)
    }
    this.handles = await Promise.all([
      PianoMidi.addListener('noteOn', (d) => this.emit({ type: 'on', midi: d.note, velocity: d.velocity, tMs: local(d, 'on'), source: 'midi' })),
      PianoMidi.addListener('noteOff', (d) => this.emit({ type: 'off', midi: d.note, tMs: local(d, 'off'), source: 'midi' })),
      PianoMidi.addListener('pedal', (d) => this.emit({ type: 'pedal', down: d.down, tMs: local(d, 'pedal'), source: 'midi' })),
      PianoMidi.addListener('devices', (d) => this.onDevices(d.devices)),
    ])
    const { devices } = await PianoMidi.start()
    this.onDevices(devices)
  }

  stop() {
    const handles = this.handles
    this.handles = []
    handles.forEach((h) => void h.remove())
    void PianoMidi.stop()
  }
}
