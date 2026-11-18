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

/** Taste losgelassen (Bildschirm, Computertastatur, MIDI). Das Mikrofon liefert das nicht. */
export interface NoteOff {
  midi: number
  tMs: number
  source: InputSource
}
