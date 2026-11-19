import { useEffect, useState, useSyncExternalStore } from 'react'
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from '@ui-sdk/react/segmented-control'
import type { Lesson } from '@piano/core/music/lessons'
import { elementsOf, newElements } from '@piano/core/music/elements'
import { AXES, PATTERNS, PROGRESSIONS, axisValues, popLesson, startCell, type Axis, type Cell, type PatternId } from '@piano/core/music/pop'
import { MIN_PATTERNS, popPrefs } from '@piano/core/music/popPrefs'
import { knownElements } from '@piano/core/practice/popPlan'
import { popToday } from '@piano/core/practice/progress'
import { store } from '@piano/core/sync/store'
import { audioContext } from '@piano/core/audio/audio'
import { elementName, t } from '@piano/core/i18n'
import { BackIcon } from '@piano/ui/shared/icons'
import { useStoreVersion } from '@piano/ui/hooks/useStoreVersion'
import { useThemeColor } from '@piano/ui/shared/useThemeColor'
import { usePiecePlayer } from '../pieces/usePiecePlayer'
import { freshText, shown } from './PopSection'
import '../../styles/pieces.css'
import '../../styles/pop.css'

const usePatterns = () => useSyncExternalStore(popPrefs.subscribe, popPrefs.patterns)

/** Wert einer Achse als Text */
function valueLabel(a: Axis, v: string): string {
  if (a === 'prog') return PROGRESSIONS[v as Cell['prog']].label
  if (a === 'key') return t.pop.keys[v as Cell['key']]
  if (a === 'pattern') return t.pop.patterns[v as PatternId].name
  if (a === 'voicing') return t.pop.voicings[v as Cell['voicing']]
  return t.pop.roles[v as Cell['role']]
}

/**
 * Seite „Party-Pianist“: oben die Musterwahl (jedes Muster anhören oder spielen, dann in den Pfad
 * nehmen oder nicht), darunter alle Übungen zum Zusammenstellen. Wir empfehlen, der Nutzer wählt.
 */
export function PopPage({ onBack, onOpen }: { onBack: () => void; onOpen: (l: Lesson) => void }) {
  useThemeColor('#fbf7ef')
  useStoreVersion()
  const patterns = usePatterns()
  const [active, setActive] = useState<PatternId | null>(null)
  const chosen = PATTERNS.filter((p) => patterns.includes(p))

  return (
    <div className="paper piece-page pop-page">
      <header className="piece-bar">
        <button type="button" className="icon-button" onClick={onBack} aria-label={t.pieces.back}>
          <BackIcon />
        </button>
      </header>
      <main className="piece-main">
        <div className="piece-head">
          <h1 className="piece-title">{t.pop.pageTitle}</h1>
          <p className="pb-note">{t.pop.sectionNote}</p>
        </div>

        <section className="app-home-section" aria-labelledby="pop-patterns">
          <h2 id="pop-patterns" className="pb-h2">
            {t.pop.patternsTitle}
          </h2>
          <p className="pb-note">{t.pop.patternsNote}</p>
          <ul className="pop-patterns">
            {PATTERNS.map((p) => (
              <PatternRow
                key={p}
                pattern={p}
                inPath={patterns.includes(p)}
                canDrop={patterns.length > MIN_PATTERNS}
                active={active === p}
                onActive={() => setActive(p)}
                onOpen={onOpen}
              />
            ))}
          </ul>
          <p className="pb-mono pop-choice">{t.pop.choice(chosen.map((p) => t.pop.patterns[p].name).join(', '))}</p>
        </section>

        <Grid patterns={patterns} onOpen={onOpen} />
      </main>
    </div>
  )
}

/** Ein Muster: Name und Beschreibung, Anhören, Spielen, im Pfad oder nicht. Klingt im Einstieg (I–V–vi–IV in C) */
function PatternRow({
  pattern,
  inPath,
  canDrop,
  active,
  onActive,
  onOpen,
}: {
  pattern: PatternId
  inPath: boolean
  canDrop: boolean
  active: boolean
  onActive: () => void
  onOpen: (l: Lesson) => void
}) {
  const lesson = popLesson({ ...startCell(), pattern })
  const player = usePiecePlayer(lesson.notes, lesson.bpm)
  // Nur ein Muster klingt: startet ein anderes, hört dieses auf
  useEffect(() => {
    if (!active && player.playing) player.pause()
  }, [active, player])
  return (
    <li className={`pop-pattern${inPath ? ' on' : ''}`}>
      <div className="pop-pattern-text">
        <strong>{t.pop.patterns[pattern].name}</strong>
        <small>{t.pop.patterns[pattern].goal}</small>
      </div>
      <div className="pop-pattern-actions">
        <button
          type="button"
          className={`piece-play${player.playing ? ' on' : ''}`}
          aria-label={player.playing ? t.pop.stop : t.pop.listen}
          onClick={() => {
            audioContext()
            onActive()
            player.toggle()
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            {player.playing ? <path d="M5 3.5h2.6v11H5zM10.4 3.5H13v11h-2.6z" fill="currentColor" /> : <path d="M5.5 3.2v11.6L14.5 9z" fill="currentColor" />}
          </svg>
        </button>
        <button type="button" className="pop-btn" onClick={() => (audioContext(), player.pause(), onOpen(lesson))}>
          {t.pop.play}
        </button>
        <button
          type="button"
          className="pop-btn pop-toggle"
          aria-pressed={inPath}
          disabled={inPath && !canDrop}
          onClick={() => popPrefs.toggle(pattern)}
        >
          {t.pop.inPath}
        </button>
      </div>
    </li>
  )
}

/** Alle Übungen: je Achse ein Umschalter, darunter was die Übung verlangt und was davon neu ist */
function Grid({ patterns, onOpen }: { patterns: PatternId[]; onOpen: (l: Lesson) => void }) {
  const [cell, setCell] = useState<Cell>(() => popToday().next[0]?.cell ?? startCell(patterns))
  // Abgewähltes Muster: auf das erste gewählte zurück
  const current = patterns.includes(cell.pattern) ? cell : { ...cell, pattern: patterns[0] }
  const lesson = popLesson(current)
  const fresh = newElements(knownElements(store.attempts()), lesson)
  const all = shown(elementsOf(lesson))
  return (
    <section className="app-home-section" aria-labelledby="pop-grid">
      <h2 id="pop-grid" className="pb-h2">
        {t.pop.gridTitle}
      </h2>
      <p className="pb-note">{t.pop.gridNote}</p>
      <div className="pop-axes">
        {AXES.map((a) => (
          <div key={a} className="pop-axis">
            <span className="pop-axis-label">{t.pop.axes[a]}</span>
            <SegmentedControl
              className="piece-switch"
              aria-label={t.pop.axes[a]}
              value={current[a]}
              onValueChange={(v) => v && setCell({ ...current, [a]: v } as Cell)}
            >
              <SegmentedControlIndicator className="piece-switch-indicator" />
              {(axisValues(a, patterns) as readonly string[]).map((v) => (
                <SegmentedControlItem key={v} value={v} className="piece-switch-item">
                  {valueLabel(a, v)}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          </div>
        ))}
      </div>
      <p className="pb-note">{t.pop.demands(all.map(elementName).join(', '))}</p>
      <p className="pb-note">{freshText({ fresh })}</p>
      <button type="button" className="pop-btn pop-go" onClick={() => (audioContext(), onOpen(lesson))}>
        {t.pop.play}
      </button>
    </section>
  )
}
