import { noteLabel, noteName } from '../music/notes'
import type { NotationKey } from '../music/notation'
import { locale } from '.'

const NAMES_EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Notenname für die Anzeige: deutsch (H, Cis) oder englisch (B, C#). */
export const displayNoteName = (midi: number) =>
  locale === 'en' ? NAMES_EN[((midi % 12) + 12) % 12] : noteName(midi)

/** Mit Oktavzahl, z. B. "C#4". */
export const displayNoteLabel = (midi: number) =>
  locale === 'en' ? `${displayNoteName(midi)}${Math.floor(midi / 12) - 1}` : noteLabel(midi)

/**
 * Name, wie er in den Noten steht: aus Stammton und Vorzeichen (spell() in notation.ts), also
 * „As“ in Des-Dur statt „Gis“. Deutsch mit H und B, englisch mit # und b.
 */
export function spelledNoteName(k: Pick<NotationKey, 'step' | 'alter'>): string {
  if (locale === 'en') return k.step + (k.alter === 1 ? '#' : k.alter === -1 ? 'b' : '')
  if (k.step === 'B') return k.alter === -1 ? 'B' : k.alter === 1 ? 'His' : 'H'
  if (k.alter === 1) return `${k.step}is`
  if (k.alter === -1) return k.step === 'E' || k.step === 'A' ? `${k.step}s` : `${k.step}es`
  return k.step
}
