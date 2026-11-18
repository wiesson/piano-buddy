import { describe, expect, it } from 'vitest'
import { OnsetDetector, calibrate } from './detector'
import { lookupFrom, mergeTakes, takeShape, type ProfileLookup } from './profile'
import { parseNote as n } from '../music/notes'
import { frames, render } from './testSignal'

/** expected: feste Menge oder Funktion der Zeit (wie im Warte-Modus, wo der Schritt weiterspringt) */
function onsets(
  sig: Float32Array,
  expected: number[] | ((tMs: number) => number[]),
  profile: ProfileLookup | null = null,
) {
  const fs = frames(sig)
  // Die ersten 0,15 s sind Stille: daraus kalibrieren wie die App
  const quiet = fs.filter((x) => x.t < 180).map((x) => x.f)
  const cal = calibrate(quiet)
  const det = new OnsetDetector(() => cal, undefined, undefined, undefined, undefined, () => profile)
  const expAt = (t: number) => new Set(typeof expected === 'function' ? expected(t) : expected)
  const out: { midi: number; t: number }[] = []
  for (const { t, f } of fs) for (const m of det.push(f, t, expAt(t))) out.push({ midi: m, t })
  return out
}

const midis = (o: { midi: number }[]) => [...new Set(o.map((x) => x.midi))].sort((a, b) => a - b)

describe('Mikrofon-Erkennung erwarteter Töne', () => {
  it('erkennt einen gespielten Einzelton zur richtigen Zeit', () => {
    const o = onsets(render(1.2, [{ midi: n('E4'), at: 0.4 }]), [n('E4')])
    expect(midis(o)).toEqual([n('E4')])
    expect(o[0].t).toBeGreaterThan(400)
    expect(o[0].t).toBeLessThan(400 + 250)
  })

  it('verwechselt den Nachbarton nicht mit dem erwarteten', () => {
    const o = onsets(render(1.2, [{ midi: n('E4'), at: 0.4 }]), [n('F4')])
    expect(midis(o)).not.toContain(n('F4'))
  })

  it('akzeptiert nicht die Oktave darunter als erwarteten Ton', () => {
    const o = onsets(render(1.2, [{ midi: n('C3'), at: 0.4 }]), [n('C4')])
    expect(midis(o)).not.toContain(n('C4'))
  })

  it('akzeptiert nicht die Oktave darüber als erwarteten Ton', () => {
    const o = onsets(render(1.2, [{ midi: n('C5'), at: 0.4 }]), [n('C4')])
    expect(midis(o)).not.toContain(n('C4'))
  })

  it('erkennt alle Töne eines Dreiklangs', () => {
    const chord = ['C4', 'E4', 'A4'].map(n)
    const o = onsets(render(1.2, chord.map((midi) => ({ midi, at: 0.4 }))), chord)
    expect(midis(o)).toEqual(chord)
  })

  it('meldet den fehlenden Akkordton nicht, wenn ein anderer gespielt wird', () => {
    const expected = ['C4', 'E4', 'A4'].map(n)
    const played = ['C4', 'E4', 'G4'].map(n)
    const o = onsets(render(1.2, played.map((midi) => ({ midi, at: 0.4 }))), expected)
    expect(midis(o)).not.toContain(n('A4'))
    expect(midis(o)).toEqual(expect.arrayContaining([n('C4'), n('E4')]))
  })

  it('erkennt Bass und Melodie im Oktavabstand gleichzeitig', () => {
    const expected = ['G3', 'G4'].map(n)
    const o = onsets(render(1.2, expected.map((midi) => ({ midi, at: 0.4 }))), expected)
    expect(midis(o)).toEqual(expected)
  })

  it('zählt einen wiederholten Anschlag doppelt, das Ausklingen aber nicht', () => {
    const e4 = n('E4')
    const o = onsets(
      render(1.8, [
        { midi: e4, at: 0.4 },
        { midi: e4, at: 1.1 },
      ]),
      [e4],
    )
    expect(o.filter((x) => x.midi === e4)).toHaveLength(2)
  })

  it('löst beim Wechsel zum nächsten Ton nur diesen neuen Ton aus', () => {
    const o = onsets(
      render(1.8, [
        { midi: n('E4'), at: 0.4 },
        { midi: n('F4'), at: 1.0 },
      ]),
      // Die App springt nach dem erkannten E4 zum F4, während E4 noch klingt
      (t) => (t < 650 ? [n('E4')] : [n('F4')]),
    )
    expect(o.map((x) => x.midi)).toEqual([n('E4'), n('F4')])
  })

  it('meldet bei Raumrauschen ohne Spiel keine Anschläge', () => {
    const o = onsets(render(1.5, [], 0.01), [n('C4'), n('E4'), n('G4')])
    expect(o).toEqual([])
  })

  it('erkennt tiefe Basstöne mit schwachem Grundton', () => {
    for (const b of ['F2', 'G2', 'A2', 'C3']) {
      const o = onsets(render(1.2, [{ midi: n(b), at: 0.4 }]), [n(b)])
      expect(midis(o), b).toContain(n(b))
    }
  })

  it('erkennt Grundton links und Dreiklang rechts zusammen (G-Dur aus „Vier Akkorde“)', () => {
    const expected = ['G2', 'H3', 'D4', 'G4'].map(n)
    const o = onsets(render(1.2, expected.map((midi) => ({ midi, at: 0.4 }))), expected)
    expect(midis(o)).toEqual(expected)
  })

  it('erkennt auch bei lautem Raumrauschen den gespielten Ton', () => {
    const o = onsets(render(1.2, [{ midi: n('D4'), at: 0.4 }], 0.02), [n('D4')])
    expect(midis(o)).toContain(n('D4'))
  })

  // Alle Töne, die in den Lektionen vorkommen, gegen ihre Halbton- und Ganzton-Nachbarn
  const LESSON_NOTES = ['F2', 'G2', 'A2', 'H2', 'C3', 'D3', 'E3', 'F3', 'G3', 'H3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4']
  for (const exp of LESSON_NOTES) {
    for (const d of [-2, -1, 1, 2]) {
      it(`akzeptiert ${exp} nicht, wenn ${d > 0 ? '+' : ''}${d} Halbtöne daneben gespielt wird`, () => {
        const o = onsets(render(1.2, [{ midi: n(exp) + d, at: 0.4 }]), [n(exp)])
        expect(midis(o)).not.toContain(n(exp))
      })
    }
  }

  // Beide Hände: Die linke Hand allein soll die rechte nicht „mitspielen“.
  it('meldet bei erwartetem C3+C4 nur C4, wenn nur C4 gespielt wird', () => {
    const o = onsets(render(1.2, [{ midi: n('C4'), at: 0.4 }]), [n('C3'), n('C4')])
    expect(midis(o)).toEqual([n('C4')])
  })

  // BEKANNTE GRENZE des Mikrofons (it.fails = wir erwarten das Scheitern): Liegt der hohe Ton auf
  // einem Oberton des tiefen (Oktave, Duodezime, Doppeloktave) und sind beide erwartet, hört die
  // App ihn auch, wenn nur der tiefe gespielt wird. Ein Lautstärkevergleich hilft nicht, weil sich
  // beide Töne im selben Bin je nach Phase verstärken oder auslöschen. Abhilfe ist MIDI.
  // Wird einer dieser Tests grün, ist die Grenze behoben: dann it.fails zu it machen.
  const MASKED: [string[], string[]][] = [
    [['C3', 'C4'], ['C3']],
    [['C3', 'G4'], ['C3']],
    [['A2', 'C4', 'E4', 'A4'], ['A2']],
    [['G2', 'H3', 'D4', 'G4'], ['G2']],
  ]
  for (const [expected, played] of MASKED) {
    it.fails(`Grenze: bei ${expected.join('+')} zählt ${played.join('+')} allein nicht als alles`, () => {
      const o = onsets(render(1.2, played.map((p) => ({ midi: n(p), at: 0.4 }))), expected.map(n))
      expect(midis(o)).toEqual(played.map(n))
    })
  }

  // Lernmodus: Ein Mikrofon, das Grundtöne kaum aufnimmt (Handy vor Digitalpiano-Lautsprechern).
  // Die feste Regel hält das F3 für die Oktave darüber; mit eingelerntem Profil zählt es.
  describe('mit eingelerntem Klangprofil', () => {
    const WEAK = 0.05
    const f3 = n('F3')
    /** Zwei Anschläge einlernen wie im Lernmodus: Frames ab dem Anschlag, Teiltonform mitteln */
    const learn = (midis: number[]) => {
      const notes: Record<number, ReturnType<typeof mergeTakes> & object> = {}
      for (const m of midis) {
        const takes = [0.4, 0.45].map((amp) => {
          const fs = frames(render(1.2, [{ midi: m, at: 0.4, amp, fund: WEAK }]))
          return takeShape(fs.filter((x) => x.t > 450 && x.t < 1000).map((x) => x.f), m)!
        })
        notes[m] = mergeTakes(takes)!
      }
      return lookupFrom({ name: 'Test', createdAt: '', notes })
    }
    const profile = learn([n('D3'), n('E3'), f3, n('G3'), n('A3'), n('F2'), n('F4')])

    it('ohne Profil fällt der Ton mit schwachem Grundton durch (Ausgangslage)', () => {
      const o = onsets(render(1.2, [{ midi: f3, at: 0.4, fund: WEAK }]), [f3])
      expect(midis(o)).not.toContain(f3)
    })

    it('mit Profil wird er erkannt', () => {
      const o = onsets(render(1.2, [{ midi: f3, at: 0.4, amp: 0.3, fund: WEAK }]), [f3], profile)
      expect(midis(o)).toEqual([f3])
    })

    for (const d of [-2, -1, 1, 2]) {
      it(`mit Profil zählt der Nachbar ${d > 0 ? '+' : ''}${d} nicht als F3`, () => {
        const o = onsets(render(1.2, [{ midi: f3 + d, at: 0.4, fund: WEAK }]), [f3], profile)
        expect(midis(o)).not.toContain(f3)
      })
    }

    it('mit Profil zählt die Oktave darüber nicht als F3', () => {
      const o = onsets(render(1.2, [{ midi: n('F4'), at: 0.4, fund: WEAK }]), [f3], profile)
      expect(midis(o)).not.toContain(f3)
    })

    it('mit Profil zählt die Oktave darunter nicht als F3', () => {
      const o = onsets(render(1.2, [{ midi: n('F2'), at: 0.4, fund: WEAK }]), [f3], profile)
      expect(midis(o)).not.toContain(f3)
    })
  })
})
