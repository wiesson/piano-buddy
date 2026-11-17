import { describe, expect, it } from 'vitest'
import { MicBench } from './bench'
import { parseNote as n } from '../music/notes'

describe('Mikrofon-Messung gegen MIDI', () => {
  it('zählt eine rechtzeitige Mikrofon-Meldung derselben Taste als erkannt, mit Verzögerung', () => {
    const b = new MicBench()
    b.truth(n('E4'), 1000)
    b.mic(n('E4'), 1140)
    b.tick(3000)
    expect(b.stats()).toMatchObject({ played: 1, detected: 1, missed: 0, falseAlarms: 0, medianLatencyMs: 140 })
  })

  it('wertet einen Anschlag ohne Mikrofon-Meldung als verpasst', () => {
    const b = new MicBench()
    b.truth(n('C3'), 1000)
    b.tick(1500)
    expect(b.stats().missed).toBe(0) // noch im Zeitfenster
    b.tick(2000)
    expect(b.stats()).toMatchObject({ detected: 0, missed: 1 })
  })

  it('benennt eine Meldung der Oktave als Fehlalarm mit Oktavfehler', () => {
    const b = new MicBench()
    b.truth(n('C3'), 1000)
    b.mic(n('C4'), 1100)
    expect(b.stats().falseAlarms).toBe(1)
    expect(b.stats().recent[0].note).toBe('Oktave über C3')
  })

  it('ordnet zwei Anschläge derselben Taste je einer Meldung zu', () => {
    const b = new MicBench()
    b.truth(n('E4'), 1000)
    b.truth(n('E4'), 1400)
    b.mic(n('E4'), 1120)
    b.mic(n('E4'), 1530)
    b.tick(4000)
    expect(b.stats()).toMatchObject({ played: 2, detected: 2, missed: 0, falseAlarms: 0 })
  })

  it('zählt eine zu späte Meldung nicht als erkannt', () => {
    const b = new MicBench()
    b.truth(n('E4'), 1000)
    b.mic(n('E4'), 1900)
    b.tick(4000)
    expect(b.stats()).toMatchObject({ detected: 0, missed: 1, falseAlarms: 1 })
  })
})
