import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from '@ui-sdk/react/segmented-control'
import { TEMPO_LADDER, type Tempo } from '@piano/core/practice/tempo'
import { t } from '@piano/core/i18n'
import { RestartIcon } from '@piano/ui/shared/icons'
import { tempoLabel } from './StageMenu'

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
    <path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l12-7.2a1 1 0 0 0 0-1.72l-12-7.2A1 1 0 0 0 7 4.8z" />
  </svg>
)
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
    <rect x="6" y="4.5" width="4.2" height="15" rx="1.4" />
    <rect x="13.8" y="4.5" width="4.2" height="15" rx="1.4" />
  </svg>
)

/**
 * Untere Leiste: Tempo-Leiter (Warten · 60 · 80 · 100 %) und ein runder Knopf. Beim Mitspielen
 * startet, hält an und setzt er fort; im Warte-Modus fängt er von vorn an (das Stück startet
 * dort mit der ersten Taste). Ein Häkchen markiert Tempi, die schon sauber gingen.
 */
export function TempoBar({
  tempo,
  onTempo,
  cleanTempos,
  state,
  onPlay,
}: {
  tempo: Tempo
  onTempo: (t: Tempo) => void
  cleanTempos: Set<Tempo>
  /** idle: bereit; running: Einzähler oder Spiel; paused; restart: Warte-Modus mit Fortschritt */
  state: 'idle' | 'running' | 'paused' | 'restart' | 'waiting'
  onPlay: () => void
}) {
  const label =
    state === 'running' ? t.tempo.pause : state === 'paused' ? t.tempo.resume : state === 'restart' || state === 'waiting' ? t.tempo.restart : t.tempo.start
  return (
    <footer className="bar tempo-bar">
      <SegmentedControl
        className="ladder"
        aria-label={t.tempo.label}
        value={String(tempo)}
        onValueChange={(v) => v && onTempo(v === 'wait' ? 'wait' : (Number(v) as Tempo))}
      >
        <SegmentedControlIndicator className="ladder-indicator" />
        {TEMPO_LADDER.map((tp) => (
          <SegmentedControlItem key={String(tp)} value={String(tp)} className="ladder-item">
            {tempoLabel(tp)}
            {cleanTempos.has(tp) && (
              <span className="ladder-tick" aria-hidden="true">
                ✓
              </span>
            )}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      <button type="button" className="play-button" onClick={onPlay} aria-label={label} disabled={state === 'waiting'}>
        {state === 'running' ? <PauseIcon /> : state === 'restart' || state === 'waiting' ? <RestartIcon /> : <PlayIcon />}
      </button>
    </footer>
  )
}
