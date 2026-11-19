import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { localized, type Localized } from '@piano/core/i18n'
import type { AmbientPlayer as Engine, AmbientState, AmbientTrack } from '@piano/core/audio/ambient'

/**
 * Kleiner Spieler unten rechts: zu ein runder Knopf in Glas wie die Leiste, beim Überfahren (oder
 * Tippen) fährt er zur Karte mit den Stücken auf. Der Knopf bleibt dabei an seinem Platz und wird
 * zu Play/Pause. Musik startet nie von selbst; Engine und Klavier laden erst beim ersten Klick.
 */

const PIECES = [
  { id: 'gymnopedie-1', title: 'Gymnopédie No. 1', composer: 'Erik Satie', year: 1888, duration: 217 },
  { id: 'clair-de-lune', title: 'Clair de Lune', composer: 'Claude Debussy', year: 1905, duration: 376 },
] as const
type PieceId = (typeof PIECES)[number]['id']

// Nur hier gebraucht; bewusst nicht in de.ts/en.ts
const L = {
  open: { de: 'Musik', en: 'Music' },
  list: { de: 'Stücke', en: 'Pieces' },
  play: { de: 'Abspielen', en: 'Play' },
  pause: { de: 'Pause', en: 'Pause' },
  idle: { de: 'Gemeinfrei, live gespielt', en: 'Public domain, played live' },
  loading: { de: 'Klavier lädt …', en: 'Loading piano …' },
} satisfies Record<string, Localized>

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function AmbientPlayer() {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<AmbientState>('idle')
  const [current, setCurrent] = useState<PieceId>(PIECES[0].id)
  const [pos, setPos] = useState(0)
  const engine = useRef<Engine | null>(null)
  const tracks = useRef(new Map<string, Promise<AmbientTrack>>())
  const loadTrack = useRef<(id: string) => Promise<AmbientTrack>>(null!)
  const root = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const getEngine = useCallback(async () => {
    if (engine.current) return engine.current
    const mod = await import('@piano/core/audio/ambient')
    const e = mod.createAmbientPlayer()
    const track = (id: string) => {
      let p = tracks.current.get(id)
      if (!p) tracks.current.set(id, (p = mod.loadAmbientTrack(id)))
      return p
    }
    loadTrack.current = track
    e.subscribe(() => {
      setState(e.state)
      if (e.track) setCurrent(e.track.id as PieceId)
    })
    // Nach dem Ende das nächste Stück, ohne Pause dazwischen außer dem Ausklang
    e.onEnded = (done) => {
      const i = PIECES.findIndex((p) => p.id === done.id)
      void track(PIECES[(i + 1) % PIECES.length].id).then((t) => e.play(t))
    }
    engine.current = e
    return e
  }, [])

  const playPiece = useCallback(
    async (id: PieceId) => {
      setCurrent(id)
      setState('loading')
      const e = await getEngine()
      try {
        await e.play(await loadTrack.current(id))
      } catch {
        setState('idle')
      }
    },
    [getEngine],
  )

  const toggle = useCallback(async () => {
    const e = engine.current
    if (e?.state === 'playing' || e?.state === 'loading') return e.pause()
    if (e?.state === 'paused' && e.track?.id === current) return void e.resume()
    void playPiece(current)
  }, [current, playPiece])

  // Fortschritt nur nachführen, solange die Karte offen ist und Musik läuft
  useEffect(() => {
    if (!open || state !== 'playing') {
      if (engine.current) setPos(engine.current.position())
      return
    }
    let raf = 0
    const tick = () => {
      if (engine.current) setPos(engine.current.position())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [open, state])

  // Schließen: Escape oder Tippen daneben
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: globalThis.PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  useEffect(() => () => engine.current?.pause(), [])

  const enter = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }
  const leave = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    closeTimer.current = setTimeout(() => setOpen(false), 280)
  }

  const playing = state === 'playing'
  const busy = state === 'loading'
  const piece = PIECES.find((p) => p.id === current)!
  const started = state !== 'idle' || pos > 0
  const status = busy ? localized(L.loading) : started ? `${mmss(pos)} / ${mmss(piece.duration)}` : localized(L.idle)

  return (
    <div
      ref={root}
      className="amb"
      data-open={open || undefined}
      data-state={state}
      onPointerEnter={enter}
      onPointerLeave={leave}
      onFocus={() => setOpen(true)}
      onBlur={(e) => !root.current?.contains(e.relatedTarget as Node) && setOpen(false)}
    >
      <ul className="amb-list" aria-label={localized(L.list)} inert={!open || undefined}>
        {PIECES.map((p) => {
          const active = p.id === current && started
          const progress = active ? Math.min(1, pos / p.duration) : 0
          return (
            <li key={p.id}>
              <button
                type="button"
                className="amb-row"
                aria-current={active || undefined}
                style={{ '--amb-progress': progress } as CSSProperties}
                onClick={() => (p.id === current && started ? toggle() : playPiece(p.id))}
              >
                <span className="amb-title">{p.title}</span>
                <span className="amb-meta">
                  {p.composer} · {p.year}
                </span>
                <span className="amb-len">{mmss(p.duration)}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="amb-status" aria-live="polite" inert={!open || undefined}>
        {status}
      </p>
      <button
        type="button"
        className="amb-main"
        aria-label={open ? localized(playing || busy ? L.pause : L.play) : localized(L.open)}
        aria-expanded={open}
        onClick={() => (open ? toggle() : setOpen(true))}
      >
        <MusicIcon />
        <Bars />
        <PlayIcon />
        <PauseIcon />
      </button>
    </div>
  )
}

const icon = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function MusicIcon() {
  return (
    <svg {...icon} className="amb-i amb-i-music">
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg {...icon} className="amb-i amb-i-play">
      <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg {...icon} className="amb-i amb-i-pause">
      <path d="M8 5v14M16 5v14" strokeWidth={3} />
    </svg>
  )
}

/** Drei Balken, die sich zur Musik wiegen: zeigt im geschlossenen Knopf, dass etwas läuft */
function Bars() {
  return (
    <span className="amb-i amb-bars" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}
