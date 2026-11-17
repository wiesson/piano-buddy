import { useCallback, useEffect, useRef, useState } from 'react'
import { connectMidi, midiKind, type MidiHandle, type MidiNote } from '../../input/midi'
import { toast } from '../shared/Toaster'
import { t } from '../../i18n'

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
export function useMidiInput(onNote: (n: MidiNote) => void) {
  const [midi, setMidi] = useState<MidiState>({ state: 'off', devices: [] })
  const handleRef = useRef<MidiHandle | null>(null)
  const liveRef = useRef(false)
  const noteRef = useRef(onNote)
  noteRef.current = onNote

  const start = useCallback(async () => {
    if (handleRef.current) return
    setMidi({ state: 'connecting', devices: [] })
    try {
      handleRef.current = await connectMidi(
        (n) => noteRef.current(n),
        (devices) => {
          liveRef.current = devices.length > 0
          setMidi({ state: 'on', devices })
        },
      )
      setPref(true)
    } catch (e) {
      console.warn('MIDI', e)
      handleRef.current = null
      liveRef.current = false
      setMidi({ state: 'off', devices: [] })
      toast(t.practice.midi.deniedTitle, { description: t.practice.midi.deniedBody, type: 'error' })
    }
  }, [])

  const stop = useCallback(() => {
    handleRef.current?.stop()
    handleRef.current = null
    liveRef.current = false
    setMidi({ state: 'off', devices: [] })
    setPref(false)
  }, [])

  const toggle = useCallback(() => {
    if (handleRef.current) return stop()
    if (!midiKind())
      return void toast(t.practice.midi.unsupportedTitle, { description: t.practice.midi.unsupportedBody, duration: 7000 })
    void start()
  }, [start, stop])

  useEffect(() => {
    if (getPref() && midiKind()) void start()
    return () => {
      handleRef.current?.stop()
      handleRef.current = null
      liveRef.current = false
    }
  }, [start])

  return { midi, toggle, liveRef }
}
