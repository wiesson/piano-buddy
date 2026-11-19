import { describe, expect, it } from 'vitest'
import type { Lesson, ScoreNote } from '../music/lessons'
import { parseNote as n } from '../music/notes'
import { TempoSession, beatMs, holdGrade, nextTempo, scoreTempoPass, slowerTempo, windowsFor, type TempoResult } from './tempo'

// Vier Viertel C D E F bei 60 Schlägen pro Minute: ein Schlag = 1000 ms, Einzähler 4 Schläge
const quarters: Lesson = {
  id: 'test',
  title: { de: 'Test', en: 'Test' },
  goal: { de: '', en: '' },
  bpm: 60,
  beatsPerBar: 4,
  notes: (['C4', 'D4', 'E4', 'F4'] as const).map((p, i): ScoreNote => ({ midi: n(p), start: i, dur: 1, hand: 'R' })),
}
const [C, D, E, F] = quarters.notes.map((x) => x.midi)

function session(tempo = 1) {
  const results: TempoResult[] = []
  const s = new TempoSession(quarters, 'R', tempo, (r) => results.push(r))
  s.start(0, 0) // Schlag 0 bei 4000 ms
  return { s, results }
}
const on = (s: TempoSession, midi: number, tMs: number, source: 'midi' | 'mic' | 'touch' = 'midi') => {
  s.tick(tMs)
  s.input({ midi, tMs, source })
}
const off = (s: TempoSession, midi: number, tMs: number) => s.release({ midi, tMs, source: 'midi' })

describe('Tempo', () => {
  it('rechnet Tempo-Stufen in Schlaglängen um', () => {
    expect(beatMs(60, 1)).toBe(1000)
    expect(beatMs(84, 0.6)).toBeCloseTo(1190.48, 1)
    expect(beatMs(80, 0.8)).toBeCloseTo(937.5, 5)
  })

  it('führt die Leiter von Warten bis 100 % und zurück', () => {
    expect(nextTempo('wait')).toBe(0.6)
    expect(nextTempo(0.8)).toBe(1)
    expect(nextTempo(1)).toBeNull()
    expect(slowerTempo(0.6)).toBe('wait')
    expect(slowerTempo('wait')).toBeNull()
  })

  it('startet nach einem Takt Einzähler', () => {
    const { s } = session()
    expect(s.beatAt(0)).toBe(-4)
    expect(s.countingIn(3999)).toBe(true)
    expect(s.beatAt(5000)).toBe(1)
    expect(s.countingIn(4001)).toBe(false)
  })
})

describe('Zeitfenster', () => {
  it('wachsen mit dem Schlag, mit festen Grenzen', () => {
    // 84 Schläge pro Minute: 714 ms, also pünktlich ±71 ms, knapp ±179 ms
    const mid = windowsFor(60000 / 84)
    expect(mid.onTime).toBeCloseTo(71.4, 1)
    expect(mid.near).toBeCloseTo(178.6, 1)
    // sehr langsam: Obergrenzen
    expect(windowsFor(2000)).toMatchObject({ onTime: 110, near: 250 })
    // sehr schnell: Untergrenzen
    expect(windowsFor(300)).toMatchObject({ onTime: 60, near: 150 })
  })

  it('geben dem Mikrofon 40 ms mehr', () => {
    expect(windowsFor(1000, 'mic').onTime).toBe(windowsFor(1000).onTime + 40)
    expect(windowsFor(1000, 'mic').near).toBe(windowsFor(1000).near + 40)
  })

  it('wertet pünktlich, früh, spät und verpasst', () => {
    const { s } = session()
    on(s, C, 4000 + 90) // innerhalb ±100 ms: pünktlich
    on(s, D, 5000 - 180) // früh, innerhalb ±250 ms
    expect(s.feedback.at(-1)).toMatchObject({ midi: D, kind: 'early' })
    on(s, E, 6000 + 240) // spät
    s.tick(7000 + 251 + 150 + 1) // F nie gespielt
    expect(s.notes.map((x) => x.state)).toEqual(['onTime', 'near', 'near', 'missed'])
    expect(s.notes[1].deltaMs).toBe(-180)
    expect(s.notes[2].deltaMs).toBe(240)
  })

  it('zählt einen Ton außerhalb jedes Fensters als falsch, nicht als Treffer', () => {
    const { s } = session()
    on(s, C, 4000 + 300)
    expect(s.notes[0].state).toBe('pending')
    expect(s.wrong).toBe(1)
  })

  it('ignoriert Töne während des Einzählers, die vor dem ersten Fenster liegen', () => {
    const { s } = session()
    on(s, E, 1500)
    expect(s.wrong).toBe(0)
  })

  it('rechnet die Verzögerung des Mikrofons heraus', () => {
    const { s } = session()
    // Das Mikrofon meldet 110 ms nach dem Anschlag; der Anschlag war 50 ms spät
    on(s, C, 4000 + 110 + 50, 'mic')
    expect(s.notes[0].state).toBe('onTime')
    expect(s.notes[0].deltaMs).toBe(50)
  })
})

describe('Haltedauer', () => {
  it('ist zu kurz unter 55 % der Länge, zu lang über einen halben Schlag (mind. 250 ms) hinaus', () => {
    expect(holdGrade(540, 1000, 1000)).toBe('short')
    expect(holdGrade(560, 1000, 1000)).toBe('ok')
    expect(holdGrade(1500, 1000, 1000)).toBe('ok')
    expect(holdGrade(1510, 1000, 1000)).toBe('long')
    // schneller Schlag: mindestens 250 ms Spielraum
    expect(holdGrade(400 + 250, 400, 400)).toBe('ok')
    expect(holdGrade(400 + 260, 400, 400)).toBe('long')
  })

  it('wertet MIDI-Loslassen, meldet zu langes Halten schon während des Spielens', () => {
    const { s } = session()
    on(s, C, 4000)
    off(s, C, 4300) // 30 % gehalten
    on(s, D, 5000)
    s.tick(5000 + 1000 + 500 + 1) // D liegt noch
    expect(s.notes[0].hold).toBe('short')
    expect(s.notes[1].hold).toBe('long')
  })

  it('beendet einen Ton, wenn dieselbe Taste neu angeschlagen wird', () => {
    const twice: Lesson = { ...quarters, notes: [0, 1].map((i): ScoreNote => ({ midi: E, start: i, dur: 1, hand: 'R' })) }
    const s = new TempoSession(twice, 'R', 1, () => {})
    s.start(0, 0)
    on(s, E, 4000)
    on(s, E, 5000) // kein Loslassen dazwischen gemeldet
    s.tick(5000 + 1000 + 500 + 1)
    expect(s.notes[0].hold).toBe('ok')
    expect(s.notes[1].hold).toBe('long')
  })

  it('lässt das Loslassen entscheiden, auch wenn ein Bild es schon „zu lang“ fand', () => {
    const { s } = session()
    on(s, C, 4000)
    s.tick(4000 + 1000 + 500 + 20) // Bildtakt: liegt noch, vorläufig zu lang
    expect(s.notes[0].hold).toBe('long')
    off(s, C, 4000 + 1490) // das Loslassen kam (mit seinem Zeitstempel) knapp davor an
    expect(s.notes[0].hold).toBe('ok')
  })

  it('wertet beim Mikrofon kein Loslassen', () => {
    const results: TempoResult[] = []
    const s = new TempoSession(quarters, 'R', 1, (r) => results.push(r))
    s.start(0, 0)
    ;[C, D, E, F].forEach((m, i) => on(s, m, 4000 + i * 1000 + 110, 'mic'))
    s.tick(20_000)
    expect(results[0].holdGraded).toBe(false)
    expect(results[0].short + results[0].long).toBe(0)
    expect(results[0].clean).toBe(true)
  })
})

describe('Wertung des Durchgangs', () => {
  it('gibt 100 % und sauber nur für pünktlich, richtig gehalten, ohne Fehler', () => {
    const { s, results } = session()
    ;[C, D, E, F].forEach((m, i) => {
      on(s, m, 4000 + i * 1000 + 20)
      off(s, m, 4000 + i * 1000 + 900)
    })
    s.tick(20_000)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ clean: true, percent: 100, onTime: 4, near: 0, missed: 0, wrong: 0, tempo: 1 })
    // Je Ton für den Geist: 20 ms spät, 88 % gehalten
    expect(results[0].timing).toEqual([20, 20, 20, 20])
    expect(results[0].held).toEqual([88, 88, 88, 88])
  })

  it('zählt knapp drei Viertel, verpasst nichts und falsche Töne halb dagegen', () => {
    const { s, results } = session()
    on(s, C, 4000)
    off(s, C, 4900)
    on(s, D, 5000 + 200) // knapp
    off(s, D, 5900)
    // E verpasst
    on(s, F, 7000)
    off(s, F, 7900)
    on(s, n('A4'), 7500) // falsch
    s.tick(20_000)
    // (1 + 0,75 + 0 + 1) / (4 + 0,5) = 61,1 %
    expect(results[0]).toMatchObject({ percent: 61, clean: false, missed: 1, near: 1, wrong: 1 })
    expect(results[0].missedBars).toEqual([1])
    expect(results[0].timing).toEqual([0, 200, null, 0])
  })

  it('kostet einen Haltefehler nur 15 % des Tons', () => {
    const r = scoreTempoPass(
      [
        { state: 'onTime', hold: 'short', start: 0, deltaMs: 0 },
        { state: 'onTime', hold: 'ok', start: 1, deltaMs: 0 },
      ],
      0,
      true,
      quarters,
    )
    expect(r.percent).toBe(92) // (0,85 + 1) / 2
    expect(r.short).toBe(1)
  })

  it('ist nicht sauber, wenn mehr als ein Fünftel falsch gehalten wurde', () => {
    const notes = Array.from({ length: 10 }, (_, i) => ({ state: 'onTime' as const, hold: i < 3 ? ('long' as const) : ('ok' as const), start: i, deltaMs: 0 }))
    expect(scoreTempoPass(notes, 0, true, quarters).clean).toBe(false)
    expect(scoreTempoPass(notes, 0, false, quarters).clean).toBe(true)
  })

  it('nennt den Takt, der am deutlichsten eilt', () => {
    const notes = [
      { state: 'onTime' as const, hold: 'ok' as const, start: 0, deltaMs: -60 },
      { state: 'onTime' as const, hold: 'ok' as const, start: 1, deltaMs: -70 },
      { state: 'onTime' as const, hold: 'ok' as const, start: 4, deltaMs: 10 },
    ]
    expect(scoreTempoPass(notes, 0, true, quarters).drift).toEqual({ bar: 1, ms: -65 })
  })
})

describe('Pause', () => {
  it('öffnet beim Fortsetzen kein Fenster neu, das vor der Pause schon zu war', () => {
    const { s } = session()
    on(s, C, 4000)
    s.pause(5000 + 300) // D (5000) nicht gespielt, sein Fenster (±250 ms) ist zu
    s.resume(10_000, 0)
    on(s, D, 10_000 + 4000 - 300) // genau auf D, nach neuer Uhr
    expect(s.notes[1].state).toBe('missed')
  })

  it('springt bei einer Pause im Einzähler nicht zurück', () => {
    const { s } = session()
    on(s, C, 4000)
    s.pause(5500)
    s.resume(10_000, 0)
    s.pause(11_000) // mitten im Einzähler
    s.resume(20_000, 0)
    expect(s.beatAt(24_000)).toBe(1.5)
  })

  it('zählt nach dem Fortsetzen auf ganzen Schlägen ein', () => {
    const { s } = session()
    expect(s.countInClicks()).toEqual([-4, -3, -2, -1])
    on(s, C, 4000)
    s.pause(5500)
    s.resume(10_000, 0)
    expect(s.countInClicks()).toEqual([-2, -1, 0, 1])
    expect(s.firstBeat).toBe(2)
    // Bei Schlag −1,5 (10 000 + 1000 ms) zeigt der Einzähler die 1 (Klick auf −2 war)
    expect(s.countInShown(11_000)).toMatchObject({ n: 1 })
  })

  it('hält die Stelle und zählt beim Fortsetzen einen Takt ein', () => {
    const { s } = session()
    on(s, C, 4000)
    s.pause(5500)
    expect(s.beatAt(9000)).toBe(1.5)
    s.resume(10_000, 0)
    expect(s.beatAt(10_000)).toBe(-2.5)
    expect(s.countingIn(10_000)).toBe(true)
    expect(s.beatAt(14_000)).toBe(1.5)
    // E fällt jetzt auf 14 500 ms
    on(s, E, 14_500)
    expect(s.notes[2].state).toBe('onTime')
  })
})

describe('Spulen beim Mitspielen', () => {
  // Zwei Takte Viertel, 60 bpm: ein Schlag = 1000 ms
  const twoBars: Lesson = {
    ...quarters,
    notes: (['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'] as const).map((p, i): ScoreNote => ({ midi: n(p), start: i, dur: 1, hand: 'R' })),
  }
  const pitches = twoBars.notes.map((x) => x.midi)

  it('hält an der Stelle, zählt einen Takt ein und wertet nur die Töne ab dort', () => {
    const results: TempoResult[] = []
    const s = new TempoSession(twoBars, 'R', 1, (r) => results.push(r))
    s.seek(4)
    expect(s.paused).toBe(true)
    expect(s.beatAt(0)).toBe(4)
    s.resume(0, 0) // Einzähler 0–4000 ms, Schlag 4 bei 4000 ms
    expect(s.beatAt(4000)).toBeCloseTo(4)
    for (let i = 4; i < 8; i++) {
      on(s, pitches[i], 4000 + (i - 4) * 1000)
      off(s, pitches[i], 4000 + (i - 4) * 1000 + 900)
    }
    s.tick(9500)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ clean: true, percent: 100, onTime: 4, missed: 0, from: { beat: 4, bar: 2 } })
  })

  it('wertet Töne im Einzähler nach dem Spulen nicht als falsch', () => {
    const s = new TempoSession(twoBars, 'R', 1, () => {})
    s.seek(4)
    s.resume(0, 0)
    on(s, pitches[0], 1000) // C im Einzähler, ein Ton vor der Stelle
    expect(s.wrong).toBe(0)
  })

  it('verwirft beim Spulen die Wertung vorher', () => {
    const results: TempoResult[] = []
    const s = new TempoSession(twoBars, 'R', 1, (r) => results.push(r))
    s.start(0, 0)
    on(s, n('C2'), 4000) // falsch
    s.pause(4100)
    s.seek(4)
    expect(s.wrong).toBe(0)
    s.resume(5000, 0) // Schlag 4 bei 9000 ms
    for (let i = 4; i < 8; i++) on(s, pitches[i], 9000 + (i - 4) * 1000)
    s.tick(14_500)
    expect(results[0]).toMatchObject({ wrong: 0, missed: 0 })
  })

  it('kennzeichnet einen Durchgang von vorn nicht als geübte Stelle', () => {
    const results: TempoResult[] = []
    const s = new TempoSession(twoBars, 'R', 1, (r) => results.push(r))
    s.seek(0)
    s.resume(0, 0)
    for (let i = 0; i < 8; i++) on(s, pitches[i], 4000 + i * 1000)
    s.tick(13_500)
    expect(results[0].from).toBeUndefined()
  })
})

describe('Tempo: Urteil je Anschlag', () => {
  it('gibt jedem Anschlag genau ein Urteil: Einzähler, pünktlich, knapp, falsch, Pause', () => {
    const { s } = session()
    const log: [number, string][] = []
    s.onJudge = (j) => log.push([j.midi, j.verdict])
    on(s, C, 1000) // im Einzähler: man sucht die Hand
    on(s, C, 4020) // pünktlich
    on(s, D, 4800) // 200 ms früh: knapp
    on(s, F, 5500) // falsch (E ist dran, F erst bei 7000)
    s.pause(5600)
    on(s, E, 5700) // angehalten
    expect(log).toEqual([
      [C, 'ignored'],
      [C, 'hit'],
      [D, 'early'],
      [F, 'wrong'],
      [E, 'ignored'],
    ])
  })
})
