import { describe, expect, it } from 'vitest'
import { calibrate } from './detector'
import { TakeCollector, checkTake, recognizedIn, type Take } from './calibrate'
import { lookupFrom, mergeTakes, takeShape } from './profile'
import { parseNote as n } from '../music/notes'
import { frames, render } from './testSignal'

/** Wie der Lernmodus: Frames in den Sammler, Anschläge zurück */
function collect(sig: Float32Array) {
  const fs = frames(sig)
  const cal = calibrate(fs.filter((x) => x.t < 180).map((x) => x.f))
  const takes: Take[] = []
  let strikes = 0
  const c = new TakeCollector(
    () => strikes++,
    (t) => takes.push(t),
  )
  for (const { t, f } of fs) c.push(f, t)
  return { takes, strikes, cal }
}

describe('Lernmodus', () => {
  it('nimmt jeden Anschlag genau einmal auf, das Ausklingen nicht', () => {
    const { takes, strikes } = collect(
      render(2.6, [
        { midi: n('F3'), at: 0.4 },
        { midi: n('F3'), at: 1.4 },
      ]),
    )
    expect(strikes).toBe(2)
    expect(takes).toHaveLength(2)
  })

  it('meldet bei Stille keinen Anschlag', () => {
    expect(collect(render(1.5, [], 0.01)).strikes).toBe(0)
  })

  it('akzeptiert die richtige Taste', () => {
    const { takes, cal } = collect(render(1.4, [{ midi: n('F3'), at: 0.4 }]))
    expect(checkTake(takes[0], n('F3'), cal)).toEqual({ ok: true })
  })

  it('erkennt, dass der Nachbar gespielt wurde', () => {
    const { takes, cal } = collect(render(1.4, [{ midi: n('G3'), at: 0.4 }]))
    expect(checkTake(takes[0], n('F3'), cal)).toEqual({ ok: false, reason: 'other', heard: n('G3') })
  })

  it('erkennt die Oktave darunter und darüber', () => {
    const below = collect(render(1.4, [{ midi: n('F2'), at: 0.4 }]))
    expect(checkTake(below.takes[0], n('F3'), below.cal)).toMatchObject({ ok: false, heard: n('F2') })
    const above = collect(render(1.4, [{ midi: n('F4'), at: 0.4 }]))
    expect(checkTake(above.takes[0], n('F3'), above.cal)).toMatchObject({ ok: false, heard: n('F4') })
  })

  it('zeigt vorher/nachher: schwacher Grundton erst nicht erkannt, mit Profil schon', () => {
    const f3 = n('F3')
    const { takes, cal } = collect(
      render(2.6, [
        { midi: f3, at: 0.4, fund: 0.05 },
        { midi: f3, at: 1.4, fund: 0.05, amp: 0.25 },
      ]),
    )
    expect(takes.every((t) => checkTake(t, f3, cal).ok)).toBe(true)
    expect(takes.some((t) => recognizedIn(t, f3, cal, null))).toBe(false)
    const profile = lookupFrom({
      name: 'Test',
      createdAt: '',
      notes: { [f3]: mergeTakes(takes.map((t) => takeShape(t.frames, f3)!))! },
    })
    expect(takes.every((t) => recognizedIn(t, f3, cal, profile))).toBe(true)
  })
})
