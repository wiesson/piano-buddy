import { useEffect } from 'react'

/**
 * Färbt Statusleiste (iOS-App vom Home-Bildschirm) und Browserleiste in der Seitenfarbe;
 * iOS wählt die Textfarbe der Statusleiste passend zur Helligkeit.
 */
export function useThemeColor(color: string) {
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    meta.content = color
  }, [color])
}
