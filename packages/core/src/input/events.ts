/**
 * Alle Eingaben (MIDI, Mikrofon, Bildschirmtasten, Computertastatur) liefern dieselben
 * Ereignisse. Die Übe-Logik fragt nicht, woher ein Ton kommt, sondern was die Quelle messen kann
 * (`SourceCaps`): Sie bewertet nur, was wirklich gemessen wurde (STU-1224).
 */
export type SourceKind = 'mic' | 'midi' | 'touch' | 'keys'

/** Was eine Quelle misst. Daraus folgt, was die Übe-Logik bewerten darf. */
export interface SourceCaps {
  /** Erwartbarer Zeitfehler des Anschlags in ms: so viel breiter ist das Fenster beim Mitspielen */
  timingMs: number
  /** So viel später als der Anschlag meldet die Quelle den Ton (Erkennungsdauer), ms */
  latencyMs: number
  /** Anschlagstärke */
  velocity: boolean
  /** Loslassen: Nur dann lässt sich Halten (Warten) und Haltedauer (Mitspielen) bewerten */
  noteOff: boolean
  /** Haltepedal */
  pedal: boolean
  /**
   * Hört Teiltöne als eigene Töne: Ein Oberton eines nahen Tons ist kein Fehler des Spielers,
   * ein von einem tieferen Akkordton verdeckter Ton gilt als ungeprüft.
   */
  overtones: boolean
  /**
   * Jeder Ton ist ein bewusster Tastendruck. Nur solche Töne dürfen etwas auslösen (Mitspielen
   * starten, Vorspielen beenden, die Stufe wechseln). Das Mikrofon hört auch Sprechen und Nachklang.
   */
  deliberate: boolean
}

const HANDS: SourceCaps = { timingMs: 0, latencyMs: 0, velocity: false, noteOff: true, pedal: false, overtones: false, deliberate: true }

export const CAPS: Record<SourceKind, SourceCaps> = {
  // Zeitstempel des Geräts; Akkorde und falsche Töne exakt
  midi: { ...HANDS, velocity: true, pedal: true },
  // Ankunft des Fingers bzw. der Taste; kein Anschlag, aber Loslassen
  touch: HANDS,
  keys: HANDS,
  // Erkennung braucht im Median etwa 110 ms und schwankt (Messkarte Mikrofon gegen MIDI)
  mic: { timingMs: 40, latencyMs: 110, velocity: false, noteOff: false, pedal: false, overtones: true, deliberate: false },
}

/** Fähigkeiten einer Quelle; unbekannte Quellen gelten als Finger auf Tasten */
export const capsOf = (kind: SourceKind | string): SourceCaps => CAPS[kind as SourceKind] ?? HANDS

export interface NoteOn {
  midi: number
  /** Zeit des Anschlags, performance.now()-Basis, an der Quelle gestempelt */
  tMs: number
  source: SourceKind
  /** Anschlagstärke 1–127, nur wo die Quelle sie misst (caps.velocity) */
  velocity?: number
  /** Kennung des Anschlags (Debug-Ebene): kommt im Urteil zurück */
  id?: number
}

/** Taste losgelassen (caps.noteOff) */
export interface NoteOff {
  midi: number
  tMs: number
  source: SourceKind
}

/** Haltepedal getreten oder losgelassen (caps.pedal) */
export interface Pedal {
  down: boolean
  tMs: number
  source: SourceKind
}

/** Ein Ereignis einer Quelle */
export type InputEvent = ({ type: 'on' } & NoteOn) | ({ type: 'off' } & NoteOff) | ({ type: 'pedal' } & Pedal)

/**
 * Eine Eingabequelle hinter einer Schnittstelle: MIDI im Browser, MIDI in der iOS-App, Mikrofon.
 * Zeitstempel entstehen an der Quelle und kommen schon in performance.now()-Zeit an.
 */
export interface InputSource {
  kind: SourceKind
  caps: SourceCaps
  /** Verbinden; Geräte (MIDI) melden sich über `onDevices` */
  start(): Promise<void>
  stop(): void
  subscribe(fn: (e: InputEvent) => void): () => void
}
