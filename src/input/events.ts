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
