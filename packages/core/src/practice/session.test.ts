import { describe, expect, it, vi } from 'vitest'
import { LESSONS } from '../music/lessons'
import { parseNote as n } from '../music/notes'
import { WaitSession, type PassResult } from './session'
import type { InputSource } from '../input/events'

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
    const { results, play, wait } = run('lh-fuenf', 'L')
    for (const m of ['C3', 'D3', 'E3', 'F3', 'G3', 'F3', 'E3', 'D3', 'C3']) play(n(m))
    wait(10_000) // der letzte Ton ist eine Ganze: erst gehalten, dann fertig
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
    wait(10_000)
    expect(results[0]).toMatchObject({ clean: false, wrong: 1 })
  })

  it('meldet einen Ton, der weder jetzt noch als Nächstes dran ist, sofort als falsch', () => {
    const { s } = run('lh-fuenf', 'L')
    s.input({ midi: n('A3'), tMs: 1000, source: 'touch' }) // erwartet C3, danach D3
    expect(s.wrongCount).toBe(1)
    expect(s.feedback).toContainEqual({ midi: n('A3'), kind: 'wrong', tMs: 1000 })
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
    const { s, play, wait } = run('vier-akkorde', 'R')
    play(n('C4'))
    play(n('E4'))
    expect(s.index).toBe(0)
    expect(s.holding).toBeNull()
    play(n('A4'))
    // vollständig: Der Akkord ist eine Ganze und wird jetzt gehalten, dann geht es weiter
    expect(s.holding).not.toBeNull()
    wait(10_000)
    expect(s.index).toBe(1)
  })

  it('markiert per Mikrofon gehörte Töne über der linken Hand als ungeprüft, per MIDI nicht', () => {
    const steps = ['C3+C4', 'D3+D4', 'E3+E4', 'F3+F4', 'G3+G4', 'F3+F4', 'E3+E4', 'D3+D4', 'C3+C4']
    for (const source of ['mic', 'midi'] as const) {
      const { results, play, wait } = run('parallel', 'LR')
      for (const st of steps) for (const p of st.split('+')) play(n(p), source)
      wait(10_000)
      expect(results[0].unverified, source).toBe(source === 'mic' ? 9 : 0)
    }
  })

  // Halten: Lange Töne (halbe Note und länger) zählen erst, wenn sie gehalten werden.
  // „Mary“ links: lauter Halbe, 84 bpm → 1,43 s je Ton, davon 80 % (1,14 s) halten
  describe('Haltedauer', () => {
    const MARY_L = ['C3', 'G3', 'C3', 'G3', 'G3', 'D3', 'C3', 'G3', 'C3', 'G3', 'C3', 'G3', 'G3', 'D3', 'C3']

    it('wartet auf dem gehaltenen langen Ton und geht nach 80 % seiner Länge weiter', () => {
      const { s, play, wait } = run('mary', 'L')
      play(n('C3'))
      expect(s.index).toBe(0)
      expect(s.holding).not.toBeNull()
      wait(1000)
      expect(s.index).toBe(0)
      wait(200) // jetzt über 1,14 s
      expect(s.index).toBe(1)
      expect(s.holding).toBeNull()
    })

    it('zu früh losgelassen: Hinweis, kein Fehler, und weiter', () => {
      const { s, results, play, wait } = run('mary', 'L')
      play(n('C3')) // t = 500
      s.release({ midi: n('C3'), tMs: 900, source: 'midi' })
      expect(s.index).toBe(1)
      expect(s.feedback.some((f) => f.kind === 'short' && f.midi === n('C3'))).toBe(true)
      for (const m of MARY_L.slice(1)) play(n(m))
      wait(10_000)
      expect(results[0]).toMatchObject({ clean: true, wrong: 0, short: 1 })
    })

    it('ein neuer Ton während des Haltens beendet es ohne Hinweis', () => {
      const { s, play } = run('mary', 'L')
      play(n('C3'))
      play(n('G3')) // 500 ms später, C3 noch gedrückt
      expect(s.index).toBe(1)
      expect(s.holding?.midis.has(n('G3'))).toBe(true)
      expect(s.shortCount).toBe(0)
    })

    it('Mikrofon: kein Halten (es hört das Loslassen nicht)', () => {
      const { s, play } = run('mary', 'L')
      play(n('C3'), 'mic')
      expect(s.holding).toBeNull()
      expect(s.index).toBe(1)
    })
  })
})
