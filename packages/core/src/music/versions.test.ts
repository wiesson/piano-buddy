import { describe, expect, it } from 'vitest'
import { elementsOf, newElements, type ElementId } from './elements'
import { LESSONS, type Lesson } from './lessons'
import { ALL_LESSONS, PATH, carryBeat, parseVersionId, versionId, versionsOf } from './versions'

describe('Fassungen', () => {
  it('die Originale behalten ihre Kennung, damit alter Fortschritt bleibt', () => {
    expect(LESSONS.map((l) => l.id).sort()).toEqual(
      [
        'lh-fuenf', 'rh-fuenf', 'wechsel', 'parallel', 'entchen', 'haenschen', 'mary', 'ode', 'jingle', 'tonleiter',
        'vier-akkorde', 'pop-begleitung', 'kanon', 'gymnopedie', 'elise', 'clair',
      ].sort(),
    )
    for (const l of LESSONS) expect(versionId(l.id, 'full')).toBe(l.id)
  })

  it('Kennungen hin und zurück', () => {
    expect(versionId('kanon', 'easy')).toBe('kanon~leicht')
    expect(parseVersionId('kanon~mittel')).toEqual({ pieceId: 'kanon', level: 'medium' })
    expect(parseVersionId('kanon')).toEqual({ pieceId: 'kanon', level: 'full' })
    expect(versionsOf('kanon~leicht').map((l) => l.id)).toEqual(['kanon~leicht', 'kanon'])
  })

  it('jede Fassung ist so lang wie ihr Original (kein Schlag verrutscht)', () => {
    const end = (id: string) => Math.max(...ALL_LESSONS.find((l) => l.id === id)!.notes.map((n) => n.start + n.dur))
    for (const l of ALL_LESSONS) expect(end(l.id), l.id).toBeCloseTo(end(parseVersionId(l.id).pieceId))
  })

  it('jeder Ton in jeder Fassung hat einen Fingersatz', () => {
    const missing = ALL_LESSONS.flatMap((l) => l.notes.filter((n) => !n.finger).map((n) => `${l.id} ${n.hand} ${n.midi}@${n.start}`))
    expect(missing).toEqual([])
  })

  it('keine Taste ist in einer Hand gleichzeitig zweimal gefingert', () => {
    for (const l of ALL_LESSONS)
      for (const h of ['L', 'R'] as const) {
        const ns = l.notes.filter((n) => n.hand === h)
        for (const a of ns) {
          const clash = ns.find((b) => b !== a && Math.abs(b.start - a.start) < 1e-6 && b.finger === a.finger)
          expect(clash, `${l.id} ${h} Finger ${a.finger} @${a.start}`).toBeUndefined()
        }
      }
  })
})

describe('Lernpfad', () => {
  it('enthält jede Fassung genau einmal', () => {
    expect(PATH.map((l) => l.id).sort()).toEqual(ALL_LESSONS.map((l) => l.id).sort())
  })

  it('jeder Schritt bringt höchstens ein neues Element', () => {
    const known = new Set<ElementId>()
    const cliffs: string[] = []
    for (const l of PATH) {
      const fresh = newElements(known, l)
      if (fresh.length > 1) cliffs.push(`${l.id}: ${fresh.join(', ')}`)
      elementsOf(l).forEach((e) => known.add(e))
    }
    expect(cliffs).toEqual([])
  })

  it('innerhalb eines Stücks kommt leicht vor mittel vor Original', () => {
    const at = (id: string) => PATH.findIndex((l) => l.id === id)
    for (const l of LESSONS) {
      const ids = versionsOf(l.id).map((v) => at(v.id))
      expect(ids, l.id).toEqual([...ids].sort((a, b) => a - b))
    }
  })

  it('leichte Fassungen ohne schwarze Tasten, wo das Original sie hat und die Tonart es erlaubt', () => {
    // Kanon (D-Dur) und Clair de Lune (Des-Dur) leicht in C-Dur
    for (const id of ['kanon~leicht', 'clair~leicht']) expect(elementsOf(PATH.find((l) => l.id === id)!), id).not.toContain('black-keys')
  })
})

describe('Gespulte Stelle beim Fassungswechsel (STU-1271)', () => {
  const byId = (id: string) => ALL_LESSONS.find((l) => l.id === id)!
  const lesson = (over: Partial<Lesson>): Lesson => ({
    id: 'x',
    title: { de: 'x', en: 'x' },
    goal: { de: '', en: '' },
    bpm: 80,
    beatsPerBar: 4,
    notes: [0, 4, 8, 12].map((start) => ({ midi: 60, start, dur: 4, hand: 'R' as const })),
    ...over,
  })

  it('gleiche Taktart und Taktzahl: die Stelle bleibt im selben Takt', () => {
    // Jingle Bells, alle Fassungen 4/4 und gleich viele Takte; Takt 5 beginnt bei Schlag 16
    const at = carryBeat(byId('jingle~leicht'), byId('jingle'), 16)
    expect(at).toBe(16)
    expect(carryBeat(byId('gymnopedie'), byId('gymnopedie~leicht'), 12)).toBe(12)
  })

  it('andere Taktart: von vorn (Für Elise leicht 3/4 gegen Original 3/8)', () => {
    expect(carryBeat(byId('elise~leicht'), byId('elise'), 12)).toBeNull()
    expect(carryBeat(byId('elise'), byId('elise~mittel'), 12)).toBeNull()
  })

  it('gleiche Taktart, aber andere Taktzahl: von vorn', () => {
    const four = lesson({})
    const five = lesson({ notes: [...four.notes, { midi: 62, start: 16, dur: 4, hand: 'R' }] })
    expect(carryBeat(four, five, 8)).toBeNull()
    // Ein Ton mehr, der einen Schlag in Takt 5 hineinreicht, ist ein Takt mehr
    const spill = lesson({ notes: [...four.notes.slice(0, 3), { midi: 60, start: 12, dur: 5, hand: 'R' }] })
    expect(carryBeat(four, spill, 8)).toBeNull()
  })

  it('anderer Auftakt: von vorn', () => {
    expect(carryBeat(lesson({}), lesson({ pickup: 1 }), 8)).toBeNull()
  })

  it('beginnt in der neuen Fassung dort kein Ton, geht es ab dem Anfang dieses Takts weiter', () => {
    const quarters = lesson({ notes: Array.from({ length: 16 }, (_, i) => ({ midi: 60, start: i, dur: 1, hand: 'R' as const })) })
    const wholes = lesson({})
    expect(carryBeat(quarters, wholes, 9)).toBe(8)
    expect(carryBeat(wholes, quarters, 9)).toBe(9)
  })

  it('zählt nur die geübte Hand: ein Ton der anderen Hand hält die Stelle nicht fest', () => {
    // Links Ganze, rechts Viertel: Wer links übt und auf Schlag 9 stand, beginnt ab Takt 3 (Schlag 8)
    const both = lesson({
      notes: [
        ...[0, 4, 8, 12].map((start) => ({ midi: 48, start, dur: 4, hand: 'L' as const })),
        ...Array.from({ length: 16 }, (_, i) => ({ midi: 60, start: i, dur: 1, hand: 'R' as const })),
      ],
    })
    expect(carryBeat(both, both, 9, 'L')).toBe(8)
    expect(carryBeat(both, both, 9, 'R')).toBe(9)
  })

  it('nicht gespult (Anfang): nichts mitzunehmen', () => {
    expect(carryBeat(byId('jingle~leicht'), byId('jingle'), 0)).toBeNull()
  })
})
