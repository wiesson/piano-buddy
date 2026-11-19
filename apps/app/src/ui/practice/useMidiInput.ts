import { useCallback, useEffect, useRef, useState } from 'react'
import { connectMidi, midiKind, type MidiHandle, type MidiNote, type MidiPedal } from '../../input/midi'
import { toast } from '@piano/ui/shared/Toaster'
import { t } from '@piano/core/i18n'

export interface MidiState {
  state: 'off' | 'connecting' | 'on'
  devices: string[]
}

const PREF_KEY = 'pianobuddy.midi'
const setPref = (on: boolean) => {
  try {
    if (on) localStorage.setItem(PREF_KEY, '1')
    else localStorage.removeItem(PREF_KEY)
  } catch {
    /* privater Modus: dann eben ohne Merken */
  }
}
const getPref = () => {
  try {
    return localStorage.getItem(PREF_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * MIDI ein- und ausschalten. Wer es einmal verbunden hat, bekommt es beim nächsten Stück
 * automatisch wieder. `live` ist wahr, solange mindestens ein Gerät angeschlossen ist.
 */
export function useMidiInput(onNote: (n: MidiNote) => void, onPedal?: (p: MidiPedal) => void) {
  const [midi, setMidi] = useState<MidiState>({ state: 'off', devices: [] })
  const handleRef = useRef<MidiHandle | null>(null)
  const liveRef = useRef(false)
  const noteRef = useRef(onNote)
  noteRef.current = onNote
  const pedalRef = useRef(onPedal)
  pedalRef.current = onPedal

  /**
   * Jeder Verbindungsaufbau hat eine Nummer. Endet er, nachdem die Seite schon weg ist oder MIDI
   * wieder aus (Aufbau ist asynchron, StrictMode baut im Dev doppelt auf), wird die Verbindung
   * sofort wieder getrennt. Sonst bliebe ein Geist zurück, der jeden Ton an eine alte Übe-Seite
   * schickt: doppelt gewertet, dort sogar mit eigenem Einzähler.
   */
  const gen = useRef(0)
  const connecting = useRef(false)

  /** quiet: automatischer Wiederverbindungsversuch, Fehler dann ohne Meldung */
  const start = useCallback(async (quiet = false) => {
    if (handleRef.current || connecting.current) return
    const my = ++gen.current
    const live = () => my === gen.current
    connecting.current = true
    setMidi({ state: 'connecting', devices: [] })
    try {
      const handle = await connectMidi(
        (n) => live() && noteRef.current(n),
        (devices) => {
          if (!live()) return
          liveRef.current = devices.length > 0
          setMidi({ state: 'on', devices })
        },
        (p) => live() && pedalRef.current?.(p),
      )
      if (!live()) return handle.stop()
      handleRef.current = handle
      setPref(true)
    } catch (e) {
      if (!live()) return
      console.warn('MIDI', e)
      handleRef.current = null
      liveRef.current = false
      setMidi({ state: 'off', devices: [] })
      if (!quiet) toast(t.practice.midi.deniedTitle, { description: t.practice.midi.deniedBody, type: 'error' })
    } finally {
      if (live()) connecting.current = false
    }
  }, [])

  /** Trennen, auch einen Aufbau, der noch läuft */
  const disconnect = useCallback(() => {
    gen.current++
    connecting.current = false
    handleRef.current?.stop()
    handleRef.current = null
    liveRef.current = false
  }, [])

  const stop = useCallback(() => {
    disconnect()
    setMidi({ state: 'off', devices: [] })
    setPref(false)
  }, [disconnect])

  const toggle = useCallback(() => {
    if (handleRef.current || connecting.current) return stop()
    if (!midiKind())
      return void toast(t.practice.midi.unsupportedTitle, { description: t.practice.midi.unsupportedBody, duration: 7000 })
    void start()
  }, [start, stop])

  useEffect(() => {
    if (getPref() && midiKind()) void start(true)
    return disconnect
  }, [start, disconnect])

  return { midi, toggle, liveRef }
}
