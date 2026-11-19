import { describe, expect, it } from 'vitest'
import { demandsOf, elementsOf, newElements, type LessonShape } from './elements'
import { voice } from './lessons'

/** Kleines Stück aus der kompakten Schreibweise, wie in lessons.ts */
const piece = (right?: string, left?: string, extra: Partial<LessonShape> = {}): LessonShape => ({
  bpm: 60,
  beatsPerBar: 4,
  notes: [...(left ? voice('L', left) : []), ...(right ? voice('R', right) : [])],
  ...extra,
})

describe('Element-Modell', () => {
  it('fünf Töne mit fünf Fingern in der C-Lage: nur die Lage, kein Umsetzen', () => {
    const p = piece('C4:1:1 D4:1:2 E4:1:3 F4:1:4 G4:1:5')
    expect(elementsOf(p)).toEqual(['register:R:mid'])
    expect(demandsOf(p).hands.R).toMatchObject({ home: 'C4', shifts: 0, crossings: 0 })
  })

  it('derselbe Finger auf einer anderen Taste heißt: die Hand setzt um', () => {
    expect(elementsOf(piece('G4:1:5 A4:1:5 G4:1:4'))).toContain('shift')
  })

  it('ein Sprung, den das Fingerpaar nicht bequem greift, ist ein Lagenwechsel', () => {
    // Zweiter und dritter Finger eine Quarte auseinander: zu weit
    expect(elementsOf(piece('C4:1:2 F4:1:3'))).toContain('shift')
    expect(elementsOf(piece('C4:1:2 D4:1:3'))).not.toContain('shift')
  })

  it('Tonleiter: Daumenuntersatz und Übersetzen, aber kein Lagenwechsel', () => {
    const els = elementsOf(
      piece(
        'C4:1:1 D4:1:2 E4:1:3 F4:1:1 G4:1:2 A4:1:3 H4:1:4 C5:1:5 H4:1:4 A4:1:3 G4:1:2 F4:1:1 E4:1:3 D4:1:2 C4:1:1',
        'C3:1:5 D3:1:4 E3:1:3 F3:1:2 G3:1:1 A3:1:3 H3:1:2 C4:1:1 H3:1:2 A3:1:3 G3:1:1 F3:1:2 E3:1:3 D3:1:4 C3:1:5',
      ),
    )
    expect(els).toContain('thumb-under')
    expect(els).not.toContain('shift')
  })

  it('rechte Hand unter dem mittleren C, linke darüber: eigene Elemente', () => {
    expect(elementsOf(piece('H3+D4+G4:4:1+2+5'))).toContain('register:R:low')
    expect(elementsOf(piece('C4+E4+G4:4:1+3+5'))).not.toContain('register:R:low')
    expect(elementsOf(piece(undefined, 'D4:4:1'))).toContain('register:L:high')
    expect(elementsOf(piece(undefined, 'F2:4:5'))).toContain('register:L:low')
  })

  it('Zweiklang und Dreiklang; wer Dreiklänge kann, für den ist ein Zweiklang nicht neu', () => {
    expect(elementsOf(piece('C4+E4:4:1+3'))).toContain('dyad')
    const triad = piece('C4+E4+G4:4:1+3+5')
    expect(elementsOf(triad)).toContain('triad')
    expect(newElements(['register:R:mid', 'triad'], piece('C4+E4:4:1+3'))).toEqual([])
  })

  it('beide Hände nacheinander ist ein anderes Element als beide Hände zugleich', () => {
    const turns = piece('-:4 C4:4:1', 'C3:4:5')
    expect(elementsOf(turns)).toContain('both-hands')
    expect(elementsOf(turns)).not.toContain('hands-together')
    expect(elementsOf(piece('C4:4:1', 'C3:4:5'))).toContain('hands-together')
  })

  it('Rhythmus zählt in Schlägen: halbe Schläge im 3/8-Takt sind dasselbe wie Achtel im 3/4-Takt', () => {
    const r = 'E4:0.5:3 D4:0.5:2 C4:1:1 C4:1:1'
    const in34 = elementsOf(piece(r, undefined, { beatsPerBar: 3 }))
    const in38 = elementsOf(piece(r, undefined, { beatsPerBar: 3, beatUnit: 8 }))
    expect(in34).toContain('eighths')
    expect(in38).toContain('eighths')
    expect(in38).not.toContain('sixteenths')
    expect(in34).toContain('meter:3/4')
    expect(in38).toContain('meter:3/8')
    expect(elementsOf(piece('C4:0.25:1 D4:0.25:2 E4:0.5:3 F4:3:4'))).toContain('sixteenths')
  })

  it('punktiert nur in einfachen Taktarten; im 9/8-Takt ist die punktierte Viertel der Grundschlag', () => {
    expect(elementsOf(piece('E4:1.5:3 D4:0.5:2 D4:2:2'))).toContain('dotted')
    expect(elementsOf(piece('E4:1.5:3 D4:1.5:2 C4:6:1', undefined, { beatsPerBar: 9, beatUnit: 8 }))).not.toContain('dotted')
  })

  it('Offbeat: Anschläge überwiegend auf der „und“, nicht schon ein punktierter Rhythmus oder ein Einsatz nach der Pause', () => {
    expect(elementsOf(piece('-:0.5 C4+E4+G4:0.5:1+3+5 -:0.5 C4+E4+G4:0.5:1+3+5 -:0.5 C4+E4+G4:0.5:1+3+5 -:0.5 C4+E4+G4:0.5:1+3+5'))).toContain('offbeat')
    expect(elementsOf(piece('E4:1.5:3 D4:0.5:2 D4:2:2'))).not.toContain('offbeat')
    expect(elementsOf(piece('A4:1:1 -:0.5 C4:0.5:1 E4:0.5:2 A4:0.5:4 H4:1:5'))).not.toContain('offbeat')
  })

  it('Sprung erst über eine Oktave hinaus', () => {
    expect(elementsOf(piece(undefined, 'C3:1:1 C2:1:5'))).not.toContain('leap')
    expect(elementsOf(piece(undefined, 'D3:1:1 C2:1:5'))).toContain('leap')
  })

  it('Auftakt und großer Umfang', () => {
    expect(elementsOf(piece('-:3 E4:1:3 C4:4:1', undefined, { pickup: 1 }))).toContain('pickup')
    expect(elementsOf(piece('C4:1:1 D5:1:5'))).toContain('wide-range')
    expect(elementsOf(piece('C4:1:1 C5:1:5'))).not.toContain('wide-range')
  })

  it('schwarze Tasten', () => {
    expect(elementsOf(piece('D4:1:1 Fis4:1:3'))).toContain('black-keys')
  })

  it('ohne Fingersatz: Umsetzen, sobald ein Abschnitt mehr als fünf Stammtöne braucht', () => {
    expect(demandsOf(piece('C4:1 D4:1 E4:1 F4:1 G4:1')).hands.R!.shifts).toBe(0)
    expect(demandsOf(piece('C4:1 D4:1 E4:1 F4:1 G4:1 A4:1')).hands.R!.shifts).toBe(1)
  })

  it('Dichte im Originaltempo: Achtel bei 120 Schlägen pro Minute sind vier Töne pro Sekunde', () => {
    const p = piece('C4:0.5:1 D4:0.5:2 E4:0.5:3 F4:0.5:4 G4:0.5:5 F4:0.5:4 E4:0.5:3 D4:0.5:2', undefined, { bpm: 120 })
    expect(demandsOf(p).hands.R!.notesPerSecond).toBe(4)
  })
})
