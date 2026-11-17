/**
 * Alle Eingaben (Mikrofon, MIDI, Bildschirmtasten, Computertastatur) liefern dasselbe
 * Ereignis. Die Übe-Logik weiß nicht, woher ein Ton kommt.
 */
export type InputSource = 'mic' | 'midi' | 'touch' | 'keys'

export interface NoteOn {
  midi: number
  tMs: number
  source: InputSource
}

// ---- MIDI (Chrome/Edge/Firefox; Safari hat kein Web MIDI) ----

export const midiSupported = () => typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator

export async function connectMidi(onNote: (n: NoteOn) => void, onDevices: (names: string[]) => void) {
  const access = await navigator.requestMIDIAccess()
  const bind = () => {
    const names: string[] = []
    access.inputs.forEach((input) => {
      names.push(input.name ?? 'MIDI')
      input.onmidimessage = (e) => {
        const d = e.data
        if (!d || d.length < 3) return
        const cmd = d[0] & 0xf0
        if (cmd === 0x90 && d[2] > 0) onNote({ midi: d[1], tMs: performance.now(), source: 'midi' })
      }
    })
    onDevices(names)
  }
  access.onstatechange = bind
  bind()
  return () => access.inputs.forEach((i) => (i.onmidimessage = null))
}

// ---- Computertastatur (physische Tastenposition, funktioniert mit QWERTZ und QWERTY) ----
// Untere Reihe = tiefe Oktave, obere Reihe = hohe Oktave, wie in Trackern üblich.
const LOW = ['KeyZ', 'KeyS', 'KeyX', 'KeyD', 'KeyC', 'KeyV', 'KeyG', 'KeyB', 'KeyH', 'KeyN', 'KeyJ', 'KeyM', 'Comma']
const HIGH = ['KeyQ', 'Digit2', 'KeyW', 'Digit3', 'KeyE', 'KeyR', 'Digit5', 'KeyT', 'Digit6', 'KeyY', 'Digit7', 'KeyU', 'KeyI']

/** baseC: MIDI-Nummer des C der unteren Reihe (Standard C3 = 48) */
export function keyToMidi(code: string, baseC = 48): number | null {
  const lo = LOW.indexOf(code)
  if (lo >= 0) return baseC + lo
  const hi = HIGH.indexOf(code)
  if (hi >= 0) return baseC + 12 + hi
  return null
}
