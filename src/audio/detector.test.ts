import { describe, expect, it } from 'vitest'
import { NoteAnalyzer, OnsetDetector, calibrate, type Frame } from './detector'
import { midiToFreq, parseNote as n } from '../music/notes'

// Synthetischer Klavierton: Teiltöne mit Inharmonizität, schnelle Ansprache, exponentielles Abklingen.
const SR = 48000
const FFT = 8192
const HOP = 1024

function render(
  durS: number,
  events: { midi: number; at: number; amp?: number; dur?: number }[],
  noise = 0.002,
  seed = 1,
) {
  const out = new Float32Array(Math.round(durS * SR))
  let x = seed
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1
  for (let i = 0; i < out.length; i++) out[i] = rnd() * noise
  for (const e of events) {
    const f0 = midiToFreq(e.midi)
    const start = Math.round(e.at * SR)
    const amp = e.amp ?? 0.2
    // Taste losgelassen: der Dämpfer stoppt die Saite (ohne Pedal) innerhalb von ~0,1 s
    const release = e.dur ?? 0.5
    for (let h = 1; h <= 10; h++) {
      const f = h * f0 * Math.sqrt(1 + 0.0004 * h * h)
      if (f > SR / 2) break
      // tiefe Töne haben schwache Grundtöne, hohe Teiltöne fallen ab
      const a = (amp / h ** 0.9) * (h === 1 && e.midi < 48 ? 0.4 : 1)
      const tau = 1.2 / h ** 0.5
      for (let i = start; i < out.length; i++) {
        const t = (i - start) / SR
        const damp = t > release ? Math.exp(-(t - release) / 0.03) : 1
        out[i] += a * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / tau) * Math.min(1, t / 0.004) * damp
      }
    }
  }
  return out
}

function frames(sig: Float32Array) {
  const an = new NoteAnalyzer(SR, FFT)
  const res: { t: number; f: Frame }[] = []
  for (let end = FFT; end <= sig.length; end += HOP) {
    res.push({ t: (end / SR) * 1000, f: an.analyze(sig.subarray(end - FFT, end)) })
  }
  return res
}

/** expected: feste Menge oder Funktion der Zeit (wie im Warte-Modus, wo der Schritt weiterspringt) */
function onsets(sig: Float32Array, expected: number[] | ((tMs: number) => number[])) {
  const fs = frames(sig)
  // Die ersten 0,15 s sind Stille: daraus kalibrieren wie die App
  const quiet = fs.filter((x) => x.t < 180).map((x) => x.f)
  const cal = calibrate(quiet)
  const det = new OnsetDetector(() => cal)
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
})
