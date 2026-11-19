import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScoreNote } from '@piano/core/music/lessons'
import { audioContext, playNote, stopAll } from '@piano/core/audio/audio'

/** Wie weit im Voraus Töne auf der Audio-Uhr geplant werden (s) */
const LOOKAHEAD = 0.8
const TICK_MS = 120

/**
 * Stück anhören: plant die Töne stückweise auf der Audio-Uhr (lange Stücke nicht auf einmal),
 * meldet die Stelle in Schlägen fürs Bild und lässt sich anhalten und an jede Stelle setzen.
 */
export function usePiecePlayer(notes: ScoreNote[], bpm: number) {
  const [playing, setPlaying] = useState(false)
  const [beat, setBeat] = useState(0)
  const length = notes.length ? Math.max(...notes.map((n) => n.start + n.dur)) : 0
  const run = useRef<{ t0: number; next: number; timer: number; raf: number } | null>(null)
  const beatRef = useRef(0)
  const spb = 60 / bpm
  const notesRef = useRef(notes)
  notesRef.current = notes

  const halt = useCallback(() => {
    const r = run.current
    if (!r) return
    clearInterval(r.timer)
    cancelAnimationFrame(r.raf)
    run.current = null
    stopAll()
  }, [])

  const start = useCallback(
    (from: number) => {
      halt()
      const ctx = audioContext()
      const sorted = [...notesRef.current].sort((a, b) => a.start - b.start)
      const t0 = ctx.currentTime + 0.12 - from * spb
      const r = { t0, next: sorted.findIndex((n) => n.start >= from - 1e-6), timer: 0, raf: 0 }
      if (r.next < 0) r.next = sorted.length
      const schedule = () => {
        const until = ctx.currentTime + LOOKAHEAD
        while (r.next < sorted.length && t0 + sorted[r.next].start * spb < until) {
          const n = sorted[r.next++]
          playNote(n.midi, Math.max(0.12, n.dur * spb * 0.95), t0 + n.start * spb, n.hand === 'L' ? 62 : 80)
        }
      }
      schedule()
      r.timer = window.setInterval(schedule, TICK_MS)
      const frame = () => {
        const b = (ctx.currentTime - t0) / spb
        if (b >= length + 0.5) {
          halt()
          beatRef.current = 0
          setBeat(0)
          setPlaying(false)
          return
        }
        beatRef.current = Math.max(from, b)
        setBeat(beatRef.current)
        r.raf = requestAnimationFrame(frame)
      }
      r.raf = requestAnimationFrame(frame)
      run.current = r
      setPlaying(true)
    },
    [halt, spb, length],
  )

  const pause = useCallback(() => {
    halt()
    setPlaying(false)
  }, [halt])

  const toggle = useCallback(() => (run.current ? pause() : start(beatRef.current >= length ? 0 : beatRef.current)), [pause, start, length])

  /** Stelle setzen; läuft es, spielt es dort weiter */
  const seek = useCallback(
    (b: number) => {
      const to = Math.max(0, Math.min(length, b))
      beatRef.current = to
      setBeat(to)
      if (run.current) start(to)
    },
    [start, length],
  )

  // Andere Fassung oder Hände: an derselben Stelle mit den neuen Tönen weiter
  useEffect(() => {
    if (run.current) start(Math.min(beatRef.current, length))
  }, [notes]) // eslint-disable-line react-hooks/exhaustive-deps

  // Seite verlassen oder in den Hintergrund: Ruhe
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && pause()
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      halt()
    }
  }, [halt, pause])

  return { playing, beat, length, seconds: length * spb, toggle, seek, pause }
}
