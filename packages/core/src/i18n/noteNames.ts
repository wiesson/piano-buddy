import { noteLabel, noteName } from '../music/notes'
import { locale } from '.'

const NAMES_EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Notenname für die Anzeige: deutsch (H, Cis) oder englisch (B, C#). */
export const displayNoteName = (midi: number) =>
  locale === 'en' ? NAMES_EN[((midi % 12) + 12) % 12] : noteName(midi)

/** Mit Oktavzahl, z. B. "C#4". */
export const displayNoteLabel = (midi: number) =>
  locale === 'en' ? `${displayNoteName(midi)}${Math.floor(midi / 12) - 1}` : noteLabel(midi)
