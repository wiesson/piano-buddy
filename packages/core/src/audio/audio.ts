import { CacheStorage, SplendidGrandPiano } from 'smplr'

/** Eine AudioContext-Instanz für Klang und Mikrofon: Ihre Uhr ist die gemeinsame Zeitbasis. */
let ctx: AudioContext | null = null
let piano: ReturnType<typeof SplendidGrandPiano> | null = null

type AudioSessionType = 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record'

/** iOS: Ohne passende Audio-Session spielt Web Audio nicht bei stummgeschaltetem iPhone. */
export function setAudioSession(type: AudioSessionType) {
  const nav = navigator as Navigator & { audioSession?: { type: AudioSessionType } }
  if (nav.audioSession) nav.audioSession.type = type
}

export function audioContext(): AudioContext {
  if (!ctx) {
    setAudioSession('playback')
    ctx = new AudioContext({ latencyHint: 'interactive' })
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function getPiano() {
  if (!piano) piano = SplendidGrandPiano(audioContext(), { storage: CacheStorage(), volume: 90 })
  return piano
}

/**
 * Geplante Töne mit ihrer Absage. smplr hält Töne, die mehr als 0,2 s in der Zukunft liegen, in
 * einer eigenen Warteschlange, die `piano.stop()` nicht leert: Ohne Absage spielten Vorspielen
 * und Player nach dem Anhalten weiter und überlagerten sich beim Springen.
 */
let pending: { stop: (time?: number) => void; end: number }[] = []

export function playNote(midi: number, duration = 0.6, when = 0, velocity = 80) {
  const p = getPiano()
  const c = audioContext()
  const at = when ? when : c.currentTime
  const stop = p.start({ note: midi, velocity, duration, time: at })
  if (pending.length > 256) pending = pending.filter((x) => x.end > c.currentTime)
  pending.push({ stop, end: at + duration + 1 })
}

/**
 * Ton klingt, solange die Taste gehalten wird, wie am Klavier: gibt die Funktion zum Loslassen
 * zurück. Ein kurzer Tipp klingt trotzdem mindestens 150 ms, sonst klingt er abgeschnitten.
 */
export function holdNote(midi: number, velocity = 80): () => void {
  const p = getPiano()
  const c = audioContext()
  const t0 = c.currentTime
  const stop = p.start({ note: midi, velocity, time: t0 })
  return () => stop(Math.max(c.currentTime, t0 + 0.15))
}

/** Alles verstummt sofort: geplante Töne abgesagt, klingende mit kurzem Ausklang */
export function stopAll() {
  const now = ctx?.currentTime
  for (const x of pending) x.stop(now)
  pending = []
  piano?.stop()
}

/**
 * Zeitpunkt auf der Audio-Uhr, an dem ein Ton zu `perfMs` (performance.now()) hörbar wird.
 * getOutputTimestamp verbindet beide Uhren samt Ausgabelatenz: Klick und Bild fallen zusammen.
 */
export function audioTimeAt(perfMs: number): number {
  const c = audioContext()
  const ts = c.getOutputTimestamp?.()
  if (ts?.performanceTime && ts.contextTime !== undefined) return ts.contextTime + (perfMs - ts.performanceTime) / 1000
  return c.currentTime + (perfMs - performance.now()) / 1000 - (c.outputLatency || c.baseLatency || 0)
}

/**
 * Metronom-Klick (kurz); betont auf der Eins. Geplant auf der Audio-Uhr. Gibt die Absage zurück:
 * Ein Klick, der noch nicht klang, bleibt dann stumm (Pause, neuer Durchgang).
 */
export function click(perfMs: number, accent = false): () => void {
  try {
    const c = audioContext()
    const t = Math.max(c.currentTime, audioTimeAt(perfMs))
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.frequency.value = accent ? 1760 : 1320
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(accent ? 0.32 : 0.18, t + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
    osc.connect(gain).connect(c.destination)
    osc.start(t)
    osc.stop(t + 0.07)
    return () => {
      try {
        gain.disconnect()
      } catch {
        // schon vorbei
      }
    }
  } catch {
    // ohne Klick geht es auch
    return () => {}
  }
}
