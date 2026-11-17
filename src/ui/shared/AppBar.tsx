import type { ReactNode } from 'react'

/**
 * Eine Leiste für alle Seiten: links ein Icon-Knopf, mittig der Titel in Geist Serif, rechts
 * ein Icon-Knopf. Unten auf Papier eine feine Linie, auf Lack der Filzstreifen.
 */
export function AppBar({ left, title, right }: { left?: ReactNode; title: ReactNode; right?: ReactNode }) {
  return (
    <header className="appbar">
      <span className="appbar-side">{left}</span>
      <h1 className="appbar-title">{title}</h1>
      <span className="appbar-side appbar-end">{right}</span>
    </header>
  )
}
