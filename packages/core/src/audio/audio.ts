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

export function playNote(midi: number, duration = 0.6, when = 0, velocity = 80) {
  const p = getPiano()
  const c = audioContext()
  p.start({ note: midi, velocity, duration, time: when ? when : c.currentTime })
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

export function stopAll() {
  piano?.stop()
}
