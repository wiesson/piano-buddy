import { describe, expect, it } from 'vitest'
import { noteLabel, parseNote } from './notes'

describe('Notennamen', () => {
  it('liest ausgegebene Namen für alle 128 MIDI-Töne wieder richtig ein', () => {
    for (let m = 0; m < 128; m++) expect(parseNote(noteLabel(m)), noteLabel(m)).toBe(m)
  })

  it('versteht die deutsche Schreibweise', () => {
    expect(parseNote('C4')).toBe(60)
    expect(parseNote('H3')).toBe(59)
    expect(parseNote('B3')).toBe(58) // deutsches B = englisches Bb
    expect(parseNote('Es4')).toBe(63)
    expect(parseNote('As3')).toBe(56)
    expect(parseNote('Fis4')).toBe(66)
    expect(parseNote('Des4')).toBe(61)
    expect(parseNote('C#4')).toBe(61)
  })

  it('lehnt Unsinn ab', () => {
    for (const bad of ['X4', 'Cs4', 'Bes3', 'C', '4C']) expect(() => parseNote(bad), bad).toThrow()
  })
})
