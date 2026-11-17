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

// MIDI: siehe midi.ts (Web MIDI und natives iOS-Plugin hinter einer Schnittstelle)

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
