import { describe, expect, it, vi } from 'vitest'
import { LESSONS } from '../music/lessons'
import { parseNote as n } from '../music/notes'
import { WaitSession, type PassResult } from './session'
import type { InputSource } from '../input/sources'

const lesson = (id: string) => LESSONS.find((l) => l.id === id)!

function run(id: string, stage: 'L' | 'R' | 'LR') {
  const results: PassResult[] = []
  vi.spyOn(performance, 'now').mockReturnValue(0)
  const s = new WaitSession(lesson(id), stage, (r) => results.push(r))
  s.restart()
  let t = 0
  const play = (midi: number, source: InputSource = 'midi', at = (t += 500)) => {
    s.input({ midi, tMs: at, source })
    s.tick(at)
  }
  return { s, results, play, wait: (ms: number) => s.tick((t += ms)) }
}

describe('Warte-Modus', () => {
  it('zählt einen fehlerfreien Durchgang als sauber', () => {
    const { results, play } = run('lh-fuenf', 'L')
    for (const m of ['C3', 'D3', 'E3', 'F3', 'G3', 'F3', 'E3', 'D3', 'C3']) play(n(m))
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ clean: true, wrong: 0 })
  })

  it('wartet beim falschen Ton und wertet den Durchgang als nicht sauber', () => {
    const { s, results, play, wait } = run('lh-fuenf', 'L')
    play(n('C3'))
    play(n('E3')) // falsch, erwartet ist D3
    wait(500)
    expect(s.index).toBe(1)
    for (const m of ['D3', 'E3', 'F3', 'G3', 'F3', 'E3', 'D3', 'C3']) play(n(m))
    expect(results[0]).toMatchObject({ clean: false, wrong: 1 })
  })

  it('zählt einen Ton, der kurz vor dem Weiterspringen kam, für den nächsten Schritt', () => {
    // Schnelles Spiel: D3 kommt 100 ms vor der (verzögerten) Erkennung von C3 an.
    const { s, play } = run('lh-fuenf', 'L')
    play(n('D3'), 'mic', 1000)
    play(n('C3'), 'mic', 1100)
    expect(s.index).toBe(2)
    expect(s.wrongCount).toBe(0)
  })

  it('braucht für einen Akkord alle Töne', () => {
    const { s, play } = run('vier-akkorde', 'R')
    play(n('C4'))
    play(n('E4'))
    expect(s.index).toBe(0)
    play(n('A4'))
    expect(s.index).toBe(1)
  })

  it('markiert per Mikrofon gehörte Töne über der linken Hand als ungeprüft, per MIDI nicht', () => {
    const steps = ['C3+C4', 'D3+D4', 'E3+E4', 'F3+F4', 'G3+G4', 'F3+F4', 'E3+E4', 'D3+D4', 'C3+C4']
    for (const source of ['mic', 'midi'] as const) {
      const { results, play } = run('parallel', 'LR')
      for (const st of steps) for (const p of st.split('+')) play(n(p), source)
      expect(results[0].unverified, source).toBe(source === 'mic' ? 9 : 0)
    }
  })
})
