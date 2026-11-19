import { describe, expect, it } from 'vitest'
import { elementsOf, newElements, type ElementId } from './elements'
import { LESSONS } from './lessons'
import { ALL_LESSONS, PATH, parseVersionId, versionId, versionsOf } from './versions'

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
