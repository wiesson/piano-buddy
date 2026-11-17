// Notennamen in deutscher Schreibweise (H statt B).
const NAMES_DE = ['C', 'Cis', 'D', 'Dis', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'B', 'H']

export const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12)

export const noteName = (midi: number) => NAMES_DE[((midi % 12) + 12) % 12]

/** Wissenschaftliche Oktavzählung: C4 = eingestrichenes c = MIDI 60. */
export const noteLabel = (midi: number) => `${noteName(midi)}${Math.floor(midi / 12) - 1}`

export const midiToFreq = (midi: number, a4 = 440) => a4 * 2 ** ((midi - 69) / 12)

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, H: 11, B: 11 }

/** "C4", "Fis3", "Gis4", "B3" (englisches B = H) → MIDI-Nummer. */
export function parseNote(s: string): number {
  const m = /^([A-H])(is|es|#|b)?(-?\d)$/.exec(s)
  if (!m) throw new Error(`Unbekannte Note: ${s}`)
  let pc = LETTER[m[1]]
  if (m[2] === 'is' || m[2] === '#') pc += 1
  if (m[2] === 'es' || m[2] === 'b') pc -= 1
  return (Number(m[3]) + 1) * 12 + pc
}
