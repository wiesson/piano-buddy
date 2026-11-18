import { describe, expect, it } from 'vitest'
import { HostClock } from './hostClock'

// Host-Uhr läuft 1 000 000 ms vor performance.now(); die Brücke braucht 3 bis 40 ms
const OFFSET = -1_000_000

describe('Zeitstempel von CoreMIDI', () => {
  it('rechnet die schwankende Laufzeit über die Brücke heraus', () => {
    const c = new HostClock()
    const delays = [3, 40, 12, 25, 4, 33]
    let out = 0
    delays.forEach((d, i) => {
      const host = 2_000_000 + i * 500 // Anschlag und Absenden fallen hier zusammen
      out = c.toLocal(host, host, host + OFFSET + d)
    })
    // Nach mehreren Meldungen gilt der kürzeste Weg (3 ms): Abweichung höchstens 3 ms statt 33 ms
    expect(out - (2_000_000 + 5 * 500 + OFFSET)).toBe(3)
  })

  it('übernimmt den Abstand zwischen Anschlag und Absenden', () => {
    const c = new HostClock()
    c.toLocal(5000, 5000, 5000 + OFFSET + 2)
    // Bluetooth: Anschlag 18 ms vor dem Absenden
    expect(c.toLocal(9982, 10_000, 10_000 + OFFSET + 30)).toBe(9982 + OFFSET + 2)
  })

  it('fängt neu an, wenn eine Uhr stand', () => {
    const c = new HostClock()
    c.toLocal(1000, 1000, 1000 + OFFSET + 2)
    // performance.now() lief 60 s weiter, die Host-Uhr nicht
    expect(c.toLocal(2000, 2000, 2000 + OFFSET + 60_000 + 5)).toBe(2000 + OFFSET + 60_005)
  })

  it('misst die Haltedauer auf der Host-Uhr, auch wenn sich der Versatz dazwischen ändert', () => {
    const c = new HostClock()
    // erster Anschlag braucht 120 ms über die Brücke, das Loslassen nur 5 ms; gehalten 300 ms
    const on = c.noteOn(60, 1000, 1000, 1000 + OFFSET + 120)
    const off = c.noteOff(60, 1300, 1300, 1300 + OFFSET + 5)
    expect(off - on).toBe(300)
  })

  it('liefert nie einen Zeitpunkt nach der Ankunft', () => {
    const c = new HostClock()
    expect(c.toLocal(3000, 1000, 500)).toBeLessThanOrEqual(500)
  })
})
