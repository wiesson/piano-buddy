import { useEffect, useState } from 'react'

/** Folgt dem Hell/Dunkel-Modus des Geräts, auch wenn er sich während des Übens ändert */
export function usePrefersLight() {
  const query = '(prefers-color-scheme: light)'
  const [light, setLight] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const on = () => setLight(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return light
}
