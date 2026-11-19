import { describe, expect, it, vi } from 'vitest'
import { LESSONS, type Lesson, type ScoreNote } from '../music/lessons'
import { parseNote as n } from '../music/notes'
import { WaitSession, type PassResult } from './session'
import type { SourceKind } from '../input/events'

const lesson = (id: string) => LESSONS.find((l) => l.id === id)!

function run(id: string, stage: 'L' | 'R' | 'LR') {
  const results: PassResult[] = []
  vi.spyOn(performance, 'now').mockReturnValue(0)
  const s = new WaitSession(lesson(id), stage, (r) => results.push(r))
  s.restart()
  let t = 0
  const play = (midi: number, source: SourceKind = 'midi', at = (t += 500)) => {
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
    s.input({ midi: n('C3'), tMs: 500, source: 'touch' }) // Start (davor gilt die Schonfrist)
    s.input({ midi: n('A3'), tMs: 1000, source: 'touch' }) // erwartet D3, danach E3
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

  it('Mikrofon: ein Oberton des erwarteten Tons ist kein Fehler, per MIDI schon', () => {
    for (const source of ['mic', 'midi'] as const) {
      const { s, play } = run('lh-fuenf', 'L')
      play(n('C3'), source) // getroffen, jetzt ist D3 dran
      s.input({ midi: n('E5'), tMs: 1200, source }) // 5. Teilton des eben gespielten C3
      expect(s.wrongCount, source).toBe(source === 'mic' ? 0 : 1)
    }
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

    it('eine Ganze am Schluss muss höchstens 1,5 s gehalten werden', () => {
      // „Fünf Finger links“, 72 bpm: die Ganze wären 2,67 s
      const { s, results, play, wait } = run('lh-fuenf', 'L')
      for (const m of ['C3', 'D3', 'E3', 'F3', 'G3', 'F3', 'E3', 'D3', 'C3']) play(n(m))
      expect(s.holding).not.toBeNull()
      wait(1400)
      expect(results).toHaveLength(0)
      wait(150)
      expect(results).toHaveLength(1)
    })

    it('Mikrofon: kein Halten (es hört das Loslassen nicht)', () => {
      const { s, play } = run('mary', 'L')
      play(n('C3'), 'mic')
      expect(s.holding).toBeNull()
      expect(s.index).toBe(1)
    })
  })
})

describe('Prozent und Schonfrist', () => {
  const FUENF = ['C3', 'D3', 'E3', 'F3', 'G3', 'F3', 'E3', 'D3', 'C3'] // 9 Schritte, Takte 1, 1, 1, 1, 2, 2, 2, 2, 3

  it('falsche Töne vor dem ersten richtigen zählen nicht: Der Durchgang bleibt sauber', () => {
    const { s, results, play, wait } = run('lh-fuenf', 'L')
    play(n('A3'))
    play(n('B3'))
    wait(1000)
    expect(s.wrongCount).toBe(0)
    expect(s.feedback.some((f) => f.kind === 'wrong')).toBe(false)
    for (const m of FUENF) play(n(m))
    wait(10_000)
    expect(results[0]).toMatchObject({ clean: true, wrong: 0, percent: 100, missedBars: [] })
  })

  it('der erste richtige Ton startet den Durchgang: Danach zählt jeder falsche Ton', () => {
    const { s, results, play, wait } = run('lh-fuenf', 'L')
    play(n('C3'))
    play(n('A3'))
    expect(s.wrongCount).toBe(1)
    for (const m of FUENF.slice(1)) play(n(m))
    wait(10_000)
    expect(results[0]).toMatchObject({ clean: false, wrong: 1 })
  })

  it('die Dauer beginnt mit dem ersten richtigen Ton, nicht mit dem Suchen davor', () => {
    // Mikrofon: kein Halten am Schluss, der Durchgang endet mit dem letzten Ton
    const { results, play } = run('lh-fuenf', 'L')
    play(n('A3'), 'mic', 1000)
    play(n('C3'), 'mic', 5000)
    for (const [i, m] of FUENF.slice(1).entries()) play(n(m), 'mic', 5000 + (i + 1) * 500)
    expect(results[0].durationMs).toBe(8 * 500)
  })

  it('ein vor dem Start gespielter Ton zählt auch dann nicht, wenn er erst nach dem Start gewertet wird', () => {
    // G3 ist der zweite Ton von „Mary“ links: Er wartet, ob er nur zu früh kam. Dann kommt C3 und wird gehalten.
    const { s, play } = run('mary', 'L')
    play(n('G3'), 'midi', 1000)
    play(n('C3'), 'midi', 1100)
    s.tick(1500) // G3 ist jetzt 500 ms alt und wird gewertet
    expect(s.wrongCount).toBe(0)
    expect(s.feedback.some((f) => f.kind === 'wrong')).toBe(false)
  })

  it('gilt auch nach „Nochmal“', () => {
    const { s, results, play, wait } = run('lh-fuenf', 'L')
    play(n('C3'))
    play(n('A3')) // zählt
    s.restart()
    play(n('A3')) // nach dem Neustart wieder Schonfrist
    for (const m of FUENF) play(n(m))
    wait(10_000)
    expect(results[0]).toMatchObject({ clean: true, wrong: 0 })
  })

  it('Prozent: Anteil der Schritte, die beim ersten Anschlag richtig waren', () => {
    const { results, play, wait } = run('lh-fuenf', 'L')
    play(n('C3'))
    play(n('A3')) // Schritt 2 (D3) verfehlt
    play(n('B3')) // noch einmal in Schritt 2: kostet nichts zusätzlich
    for (const m of FUENF.slice(1, 6)) play(n(m))
    play(n('A3')) // Schritt 7 (E3, Takt 2) verfehlt
    for (const m of FUENF.slice(6)) play(n(m))
    wait(10_000)
    // 7 von 9 Schritten richtig = 77,7 % → 77 (abgerundet)
    expect(results[0]).toMatchObject({ clean: false, wrong: 3, percent: 77, missedBars: [1, 2] })
  })
})

describe('Spulen im Warte-Modus', () => {
  // Zwei Takte Viertel: C D E F | G A H C
  const twoBars: Lesson = {
    id: 'spulen',
    title: { de: 'Spulen', en: 'Seek' },
    goal: { de: '', en: '' },
    bpm: 60,
    beatsPerBar: 4,
    notes: (['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'] as const).map((p, i): ScoreNote => ({ midi: n(p), start: i, dur: 1, hand: 'R' })),
  }
  const pitches = twoBars.notes.map((x) => x.midi)
  function seekRun() {
    const results: PassResult[] = []
    vi.spyOn(performance, 'now').mockReturnValue(0)
    const s = new WaitSession(twoBars, 'R', (r) => results.push(r))
    s.restart()
    let t = 0
    const play = (midi: number) => {
      s.input({ midi, tMs: (t += 500), source: 'midi' })
      s.tick(t)
    }
    return { s, results, play }
  }

  it('beginnt am ersten Ton des Takts und kennzeichnet den Durchgang als geübte Stelle', () => {
    const { s, results, play } = seekRun()
    s.seek(4)
    expect(s.index).toBe(4)
    for (const m of pitches.slice(4)) play(m)
    expect(results).toHaveLength(1)
    expect(results[0].from).toEqual({ beat: 4, bar: 2 })
    // Prozent nur über die gespielte Stelle
    expect(results[0].percent).toBe(100)
  })

  it('wertet Prozent nur über die Schritte ab der Stelle', () => {
    const { s, results, play } = seekRun()
    s.seek(4)
    play(pitches[4])
    play(n('C3')) // falsch, erwartet A4
    for (const m of pitches.slice(5)) play(m)
    expect(results[0].percent).toBe(75)
  })

  it('beginnt am ersten Schritt an oder nach der Loslass-Stelle, ohne auf den Takt zu runden', () => {
    const { s, results, play } = seekRun()
    s.seek(3.4) // zwischen F (3) und G (4): weiter mit G, nie zurück zu F
    expect(s.index).toBe(4)
    expect(s.beat).toBe(4)
    s.seek(0.6) // kurz hinter dem Anfang: weiter mit D, nicht zurück an den Anfang
    expect(s.index).toBe(1)
    s.seek(3.4)
    for (const m of pitches.slice(4)) play(m)
    expect(results[0].from).toEqual({ beat: 4, bar: 2 }) // „Ab Takt 2“: der Takt des Tons, an dem es weitergeht
  })

  it('zählt Spulen an den Anfang als ganzen Durchgang', () => {
    const { s, results, play } = seekRun()
    s.seek(4)
    s.seek(0)
    for (const m of pitches) play(m)
    expect(results[0].from).toBeUndefined()
    expect(results[0].clean).toBe(true)
  })

  it('setzt nach dem Spulen die Schonfrist neu: Suchen der Starttaste ist kein Fehler', () => {
    const { s, results, play } = seekRun()
    s.seek(4)
    play(n('C3'))
    for (const m of pitches.slice(4)) play(m)
    expect(results[0]).toMatchObject({ clean: true, wrong: 0 })
  })

  it('wiederholt mit „nochmal“ die Stelle, „von vorn“ den ganzen Durchgang', () => {
    const { s, results, play } = seekRun()
    s.seek(4)
    for (const m of pitches.slice(4)) play(m)
    s.again()
    expect(s.index).toBe(4)
    s.restart()
    expect(s.index).toBe(0)
    for (const m of pitches) play(m)
    expect(results[1].from).toBeUndefined()
  })
})

describe('Warte-Modus: Urteil je Anschlag', () => {
  /** Session mit Protokoll der Urteile (Ton, Urteil) */
  function judged(opts = {}) {
    vi.spyOn(performance, 'now').mockReturnValue(0)
    const s = new WaitSession(lesson('lh-fuenf'), 'L', () => {}, opts)
    s.restart()
    const log: [string, string][] = []
    s.onJudge = (j) => log.push([String(j.midi), j.verdict])
    const at = (midi: string, tMs: number) => {
      s.input({ midi: n(midi), tMs, source: 'midi' })
      s.tick(tMs)
    }
    return { s, log, at, name: (m: string) => String(n(m)) }
  }

  it('gibt jedem Anschlag genau ein Urteil: Schonfrist, Treffer, falsch, übernommen, verworfen', () => {
    const { s, log, at, name } = judged()
    at('E3', 100) // vor dem ersten richtigen Ton: Schonfrist
    at('C3', 500) // Treffer, Durchgang beginnt
    at('A3', 1000) // weder jetzt (D3) noch als Nächstes (E3): falsch
    at('E3', 1500) // zu früh: wartet auf D3
    at('D3', 1600) // Treffer, dann zählt E3 für den neuen Schritt
    at('G3', 1700) // F3 ist dran, G3 als Nächstes: offen
    s.restart() // offen beim Neustart: verworfen
    expect(log).toEqual([
      [name('E3'), 'grace'],
      [name('C3'), 'hit'],
      [name('A3'), 'wrong'],
      [name('D3'), 'hit'],
      [name('E3'), 'carried'],
      [name('G3'), 'dropped'],
    ])
  })

  it('wertet einen zu frühen Ton nach der eingestellten Frist als falsch', () => {
    const { s, log, at, name } = judged({ wrongDelayMs: 1000 })
    at('C3', 500)
    at('E3', 1000) // nächster Schritt nach D3
    s.tick(1900)
    expect(log).toEqual([[name('C3'), 'hit']])
    s.tick(2000)
    expect(log).toEqual([
      [name('C3'), 'hit'],
      [name('E3'), 'wrong'],
    ])
  })

  it('übernimmt einen Ton für den neuen Schritt nur innerhalb der eingestellten Frist', () => {
    for (const [carryMs, expected] of [
      [450, 'carried'],
      [100, 'wrong'],
    ] as const) {
      const { s, log, at, name } = judged({ carryMs })
      at('C3', 500)
      at('E3', 1400) // 200 ms vor D3
      at('D3', 1600)
      s.tick(3000)
      expect(log.find(([m]) => m === name('E3'))?.[1], `carryMs ${carryMs}`).toBe(expected)
    }
  })
})

describe('Warte-Modus: nachsichtige Schalter (Variante B)', () => {
  function judged(opts = {}) {
    vi.spyOn(performance, 'now').mockReturnValue(0)
    const s = new WaitSession(lesson('vier-akkorde'), 'R', () => {}, opts)
    s.restart()
    const log: string[] = []
    s.onJudge = (j) => log.push(j.verdict)
    const at = (midi: string, tMs: number) => {
      s.input({ midi: n(midi), tMs, source: 'midi' })
      s.tick(tMs)
    }
    return { s, log, at }
  }

  it('repeatOk: ein nachgefasster Akkordton ist kein Fehler, ohne den Schalter schon', () => {
    for (const repeatOk of [false, true]) {
      const { s, log, at } = judged({ repeatOk })
      at('C4', 100)
      at('E4', 150)
      at('E4', 400) // nochmal, A4 fehlt noch
      expect(log[2], `repeatOk ${repeatOk}`).toBe(repeatOk ? 'ignored' : 'wrong')
      expect(s.wrongCount).toBe(repeatOk ? 0 : 1)
    }
  })

  it('strayDelay: ein Streuton wird erst nach der Frist falsch, nicht beim Anschlag', () => {
    const { s, log, at } = judged({ strayDelay: true, wrongDelayMs: 500 })
    at('C4', 100) // Start
    at('C2', 200) // gehört nirgends hin
    expect(log).toEqual(['hit'])
    s.tick(700)
    expect(log).toEqual(['hit', 'wrong'])
  })
})

describe('Warte-Modus: offene Anschläge', () => {
  it('Variante A: ein zu früher Ton, der ohne Bilder über 2 s liegen bleibt, fällt heraus statt zu zählen', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0)
    const s = new WaitSession(lesson('lh-fuenf'), 'L', () => {})
    s.restart()
    const log: string[] = []
    s.onJudge = (j) => log.push(j.verdict)
    s.input({ midi: n('C3'), tMs: 500, source: 'midi' })
    s.input({ midi: n('E3'), tMs: 1000, source: 'midi' }) // nach D3 dran; kein tick (App im Hintergrund)
    s.input({ midi: n('D3'), tMs: 3100, source: 'midi' })
    expect(s.wrongCount).toBe(0)
    expect(log).toEqual(['hit', 'dropped', 'hit'])
  })

  it('am Ende Offenes verwerfen: Das Ergebnis steht, danach kommt kein Urteil mehr', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0)
    const results: PassResult[] = []
    const s = new WaitSession(lesson('lh-fuenf'), 'L', (r) => results.push(r), { strayDelay: true })
    s.restart()
    const log: string[] = []
    s.onJudge = (j) => log.push(j.verdict)
    let t = 0
    for (const m of ['C3', 'D3', 'E3', 'F3', 'G3', 'F3', 'E3', 'D3']) {
      s.input({ midi: n(m), tMs: (t += 500), source: 'midi' })
      s.tick(t)
    }
    s.input({ midi: n('A3'), tMs: (t += 500), source: 'midi' }) // Streuton, gepuffert
    s.input({ midi: n('C3'), tMs: t + 10, source: 'midi' }) // letzter Ton (Ganze: halten)
    s.release({ midi: n('C3'), tMs: t + 20, source: 'midi' })
    expect(results).toHaveLength(1)
    expect(results[0].wrong).toBe(0)
    s.tick(t + 5000)
    expect(log.slice(-2)).toEqual(['hit', 'dropped'])
    expect(log).toHaveLength(10)
  })

  it('repeatOk: ein nachgefasster Ton, der auch im nächsten Schritt vorkommt, wird nach der Frist kein Fehler', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0)
    const s = new WaitSession(lesson('vier-akkorde'), 'R', () => {}, { repeatOk: true, wrongDelayMs: 500 })
    s.restart()
    const log: string[] = []
    s.onJudge = (j) => log.push(j.verdict)
    s.input({ midi: n('C4'), tMs: 100, source: 'midi' })
    s.input({ midi: n('C4'), tMs: 300, source: 'midi' }) // C4 auch im nächsten Akkord: gepuffert
    s.tick(900)
    expect(log).toEqual(['hit', 'ignored'])
    expect(s.wrongCount).toBe(0)
  })
})

describe('Warte-Modus: Hilfe gezählt', () => {
  it('zählt jeden Schritt einmal, bei dem die Taste leuchtete, und beginnt beim Neustart von vorn', () => {
    const { s, results, play, wait } = run('lh-fuenf', 'L')
    s.markHinted() // Schritt 1 (C3) mit Hilfe
    s.markHinted() // derselbe Schritt, zählt nicht doppelt
    play(n('C3'))
    play(n('D3'))
    s.markHinted() // Schritt 3 (E3) mit Hilfe
    for (const m of ['E3', 'F3', 'G3', 'F3', 'E3', 'D3', 'C3']) play(n(m))
    wait(10_000)
    expect(results[0].hinted).toBe(2)
    s.markHinted()
    s.restart()
    for (const m of ['C3', 'D3', 'E3', 'F3', 'G3', 'F3', 'E3', 'D3', 'C3']) play(n(m))
    wait(10_000)
    expect(results[1].hinted).toBe(0)
  })
})
