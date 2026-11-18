import { describe, expect, it } from 'vitest'
import { LESSONS, notesForStage } from '../music/lessons'
import { parseNote as n } from '../music/notes'
import { fingerToMidi, keyToFinger } from './fingerKeys'

const notes = (id: string, stage: 'L' | 'R' | 'LR') => notesForStage(LESSONS.find((l) => l.id === id)!, stage)

describe('Fingertasten', () => {
  it('belegt links A bis G mit kleinem Finger bis Daumen, rechts H bis Ö mit Daumen bis kleinem Finger', () => {
    expect(keyToFinger('KeyA')).toEqual({ hand: 'L', finger: 5 })
    expect(keyToFinger('KeyG')).toEqual({ hand: 'L', finger: 1 })
    expect(keyToFinger('KeyH')).toEqual({ hand: 'R', finger: 1 })
    expect(keyToFinger('Semicolon')).toEqual({ hand: 'R', finger: 5 })
    expect(keyToFinger('KeyQ')).toBeNull()
  })

  it('spielt mit dem richtigen Finger den erwarteten Ton', () => {
    const ns = notes('lh-fuenf', 'L')
    expect(fingerToMidi(ns, 0, 'L', 5)).toBe(n('C3'))
    expect(fingerToMidi(ns, 1, 'L', 4)).toBe(n('D3'))
  })

  it('spielt mit dem falschen Finger den Ton, auf dem dieser Finger gerade liegt', () => {
    const ns = notes('lh-fuenf', 'L')
    // Schritt 2 erwartet D3 (Finger 4); Finger 5 liegt noch auf C3
    expect(fingerToMidi(ns, 1, 'L', 5)).toBe(n('C3'))
    // Finger 2 kam noch nicht dran: seine Lage ergibt sich aus der nächsten Note (F3)
    expect(fingerToMidi(ns, 1, 'L', 2)).toBe(n('F3'))
  })

  it('greift Akkorde mit mehreren Fingern und folgt Lagenwechseln', () => {
    const ns = notes('vier-akkorde', 'R')
    // a-Moll: C4 E4 A4 mit 1 2 5
    expect([1, 2, 5].map((f) => fingerToMidi(ns, 0, 'R', f))).toEqual([n('C4'), n('E4'), n('A4')])
    // F-Dur ab Schlag 4: der dritte Finger liegt auf F4
    expect(fingerToMidi(ns, 4, 'R', 3)).toBe(n('F4'))
  })
})
