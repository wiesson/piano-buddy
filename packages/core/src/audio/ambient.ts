import { CacheStorage, Reverb, SplendidGrandPiano } from 'smplr'
import { audioContext } from './audio'

/**
 * Hintergrundmusik der Startseite: gemeinfreie Stücke als Notenliste (tools/midi-to-ambient.py),
 * gespielt mit dem Klavier der App, leiser und mit Hall. Eigenes Klavier und eigener Bus, damit
 * Ausblenden und Hall die Klaviatur zum Ausprobieren nicht berühren; die Samples kommen aus dem
 * gemeinsamen Cache.
 */

export interface AmbientTrack {
  id: string
  title: string
  composer: string
  year: number
  /** Länge in Sekunden inklusive Ausklang */
  duration: number
  /** je Ton vier Zahlen: Beginn ms, MIDI-Ton, Dauer ms, Anschlag */
  notes: number[]
}

export type AmbientState = 'idle' | 'loading' | 'playing' | 'paused'

/** So weit im Voraus werden Töne auf der Audio-Uhr geplant; der Takt holt nach */
const LOOKAHEAD = 1.2
const TICK_MS = 200
const FADE = 0.6

export interface AmbientPlayer {
  readonly state: AmbientState
  readonly track: AmbientTrack | null
  /** Position im aktuellen Stück in Sekunden */
  position(): number
  /** Stück laden (falls nötig) und ab `from` spielen */
  play(track: AmbientTrack, from?: number): Promise<void>
  pause(): void
  resume(): Promise<void>
  subscribe(fn: () => void): () => void
  /** Aufgerufen, wenn ein Stück zu Ende ist (zum Weiterschalten) */
  onEnded: ((track: AmbientTrack) => void) | null
}

export function createAmbientPlayer(): AmbientPlayer {
  let piano: ReturnType<typeof SplendidGrandPiano> | null = null
  let bus: GainNode | null = null
  let ready: Promise<void> | null = null

  let state: AmbientState = 'idle'
  let track: AmbientTrack | null = null
  /** Audio-Zeit, zu der Sekunde 0 des Stücks erklingt */
  let origin = 0
  let next = 0
  let pausedAt = 0
  let timer: ReturnType<typeof setInterval> | null = null
  let run = 0
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())
  const set = (s: AmbientState) => {
    state = s
    emit()
  }

  function setup(): Promise<void> {
    if (ready) return ready
    const ctx = audioContext()
    bus = ctx.createGain()
    bus.connect(ctx.destination)
    piano = SplendidGrandPiano(ctx, { storage: CacheStorage(), volume: 72, destination: bus, decayTime: 1.2 })
    const reverb = Reverb(ctx)
    reverb.connect(bus)
    piano.output.addEffect('reverb', reverb, 0.32)
    void reverb.ready().then(() => {
      const p = (name: Parameters<typeof reverb.getParam>[0], v: number) => {
        const param = reverb.getParam(name)
        if (param) param.value = v
      }
      p('decay', 0.72)
      p('damping', 0.35)
      p('preDelay', Math.round(ctx.sampleRate * 0.02))
    })
    ready = Promise.all([piano.ready, reverb.ready()]).then(() => undefined)
    return ready
  }

  function stopTimer() {
    if (timer) clearInterval(timer)
    timer = null
  }

  function schedule() {
    if (!piano || !track) return
    const ctx = audioContext()
    const horizon = ctx.currentTime + LOOKAHEAD
    const n = track.notes
    while (next < n.length) {
      const at = origin + n[next] / 1000
      if (at > horizon) break
      if (at >= ctx.currentTime - 0.05)
        piano.start({ note: n[next + 1], time: Math.max(at, ctx.currentTime), duration: n[next + 2] / 1000, velocity: n[next + 3] })
      next += 4
    }
    if (ctx.currentTime - origin >= track.duration) {
      stopTimer()
      pausedAt = 0
      const done = track
      set('paused')
      player.onEnded?.(done)
    }
  }

  function start(from: number) {
    const ctx = audioContext()
    const n = track!.notes
    origin = ctx.currentTime + 0.08 - from
    next = 0
    while (next < n.length && n[next] / 1000 < from) next += 4
    bus!.gain.cancelScheduledValues(ctx.currentTime)
    bus!.gain.setValueAtTime(1, ctx.currentTime)
    stopTimer()
    schedule()
    timer = setInterval(schedule, TICK_MS)
    set('playing')
  }

  const player: AmbientPlayer = {
    get state() {
      return state
    },
    get track() {
      return track
    },
    position() {
      if (!track) return 0
      if (state !== 'playing') return pausedAt
      return Math.min(track.duration, Math.max(0, audioContext().currentTime - origin))
    },
    async play(t, from = 0) {
      const my = ++run
      const wasPlaying = state === 'playing'
      halt()
      track = t
      pausedAt = from
      if (!piano) set('loading')
      else emit()
      await setup()
      // Erst ausklingen lassen, sonst hebt der Neustart den Rest der Blende wieder an
      if (wasPlaying) await new Promise((r) => setTimeout(r, FADE * 1000))
      if (my !== run) return
      start(from)
    },
    pause() {
      if (state === 'loading') {
        run++
        set(track ? 'paused' : 'idle')
        return
      }
      if (state !== 'playing') return
      pausedAt = player.position()
      halt()
      set('paused')
    },
    async resume() {
      if (!track || state === 'playing') return
      await player.play(track, pausedAt)
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => void listeners.delete(fn)
    },
    onEnded: null,
  }

  /** Geplante Töne weich ausblenden und verwerfen */
  function halt() {
    stopTimer()
    if (!piano || !bus) return
    const ctx = audioContext()
    const g = bus.gain
    g.cancelScheduledValues(ctx.currentTime)
    g.setValueAtTime(g.value, ctx.currentTime)
    g.linearRampToValueAtTime(0, ctx.currentTime + FADE)
    piano.stop({ time: ctx.currentTime + FADE })
  }

  return player
}

export async function loadAmbientTrack(id: string): Promise<AmbientTrack> {
  const res = await fetch(`/music/${id}.json`)
  if (!res.ok) throw new Error(`Stück ${id} nicht gefunden`)
  return (await res.json()) as AmbientTrack
}
