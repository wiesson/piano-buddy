/**
 * Bildet Zeitstempel einer fremden Uhr (iOS: Host-Zeit von CoreMIDI) auf performance.now() ab.
 * Jede Meldung bringt die Host-Zeit beim Absenden mit; Ankunft minus Absenden ist Uhrversatz plus
 * Laufzeit über die Capacitor-Brücke. Das Minimum der letzten Meldungen ist der Versatz bei
 * kürzester Laufzeit: Damit zählt die schwankende Laufzeit nicht mehr für die Wertung.
 */
export class HostClock {
  private samples: number[] = []
  /** Anschlag je Taste: Host-Zeit und abgebildete Zeit */
  private onsets = new Map<number, { host: number; local: number }>()

  /** Anschlag abbilden und merken */
  noteOn(midi: number, eventMs: number, sentMs: number, arrivedMs: number): number {
    const local = this.toLocal(eventMs, sentMs, arrivedMs)
    this.onsets.set(midi, { host: eventMs, local })
    return local
  }

  /**
   * Loslassen: Die Haltedauer kommt aus der Host-Uhr (Anschlag bis Loslassen). Sonst könnte eine
   * neue, bessere Schätzung des Versatzes zwischen beiden Ereignissen sie verkürzen oder dehnen.
   */
  noteOff(midi: number, eventMs: number, sentMs: number, arrivedMs: number): number {
    const local = this.toLocal(eventMs, sentMs, arrivedMs)
    const on = this.onsets.get(midi)
    this.onsets.delete(midi)
    if (!on) return local
    // Ohne Kappung bei der Ankunft: War der Anschlag zu spät geschätzt, bleibt die Dauer trotzdem richtig
    return on.local + Math.max(0, eventMs - on.host)
  }

  constructor(private readonly size = 32) {}

  toLocal(eventMs: number, sentMs: number, arrivedMs: number): number {
    const sample = arrivedMs - sentMs
    // Springt der Versatz um mehr als eine Sekunde nach oben (Gerät schlief, eine Uhr stand),
    // gelten die alten Werte nicht mehr
    if (this.samples.length && sample - Math.min(...this.samples) > 1000) this.samples = []
    this.samples.push(sample)
    if (this.samples.length > this.size) this.samples.shift()
    const offset = Math.min(...this.samples)
    // nie in der Zukunft
    return Math.min(eventMs + offset, arrivedMs)
  }
}
