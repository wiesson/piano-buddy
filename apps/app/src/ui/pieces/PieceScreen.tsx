import { useMemo, useState, useSyncExternalStore } from 'react'
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from '@ui-sdk/react/segmented-control'
import { Slider, SliderControl, SliderIndicator, SliderThumb, SliderTrack } from '@ui-sdk/react/slider'
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@ui-sdk/react/alert-dialog'
import type { Lesson } from '@piano/core/music/lessons'
import { barsOf, easyNotes, pieceNotes, sectionsOf, type PartHand, type Piece, type Version } from '@piano/core/music/piece'
import { pathOf, pieces } from '@piano/core/music/pieceStore'
import { lessonDone } from '@piano/core/practice/progress'
import { displayNoteLabel } from '@piano/core/i18n/noteNames'
import { t } from '@piano/core/i18n'
import { audioContext } from '@piano/core/audio/audio'
import { BackIcon } from '@piano/ui/shared/icons'
import { LessonRow } from '@piano/ui/home/LessonRow'
import { useThemeColor } from '@piano/ui/shared/useThemeColor'
import { PieceOverview } from './PieceOverview'
import { usePiecePlayer } from './usePiecePlayer'
import '../../styles/pieces.css'

const HANDS: PartHand[] = ['L', 'R', 'split', 'off']

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/**
 * Ein eigenes Stück: anhören (Original oder leicht), Spuren den Händen zuordnen, und der
 * Lernpfad, den die App daraus gebaut hat. Jede Zeile dort ist eine Lektion wie im Lernpfad
 * der Startseite.
 */
export function PieceScreen({ pieceId, onBack, onOpen }: { pieceId: string; onBack: () => void; onOpen: (l: Lesson) => void }) {
  useThemeColor('#f6eedf')
  const piece = useSyncExternalStore(pieces.subscribe, () => pieces.get(pieceId))
  const [version, setVersion] = useState<Version>('full')
  if (!piece) return null
  return <PieceView piece={piece} version={version} setVersion={setVersion} onBack={onBack} onOpen={onOpen} />
}

function PieceView({
  piece,
  version,
  setVersion,
  onBack,
  onOpen,
}: {
  piece: Piece
  version: Version
  setVersion: (v: Version) => void
  onBack: () => void
  onOpen: (l: Lesson) => void
}) {
  const full = useMemo(() => pieceNotes(piece), [piece])
  const notes = useMemo(() => (version === 'easy' ? easyNotes(full, piece.beatsPerBar) : full), [full, version, piece.beatsPerBar])
  const sections = useMemo(() => sectionsOf(full, piece.beatsPerBar), [full, piece.beatsPerBar])
  const path = pathOf(piece)
  const player = usePiecePlayer(notes, piece.bpm)
  const spb = 60 / piece.bpm
  const next = path.find((s) => !lessonDone(s.lesson))

  const update = (change: Partial<Piece>) => pieces.save({ ...piece, ...change })
  const setHand = (i: number, hand: PartHand) => update({ parts: piece.parts.map((p, j) => (j === i ? { ...p, hand } : p)) })
  const splitUsed = piece.parts.some((p) => p.hand === 'split')

  return (
    <div className="paper piece-page">
      <header className="piece-bar">
        <button type="button" className="icon-button" onClick={onBack} aria-label={t.pieces.back}>
          <BackIcon />
        </button>
      </header>

      <main className="piece-main">
        <div className="piece-head">
          <h1 className="piece-title">{piece.title}</h1>
          <p className="pb-mono">{t.pieces.meta(barsOf(piece), full.length, piece.bpm)}</p>
        </div>

        <section className="piece-player" aria-label={t.pieces.listen}>
          <PieceOverview
            notes={notes}
            length={player.length}
            beat={player.beat}
            sections={sections}
            beatsPerBar={piece.beatsPerBar}
            onSeek={player.seek}
            label={piece.title}
          />
          <div className="piece-transport">
            <button
              type="button"
              className={`piece-play${player.playing ? ' on' : ''}`}
              onClick={() => (audioContext(), player.toggle())}
              aria-label={player.playing ? t.pieces.pause : t.pieces.listen}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                {player.playing ? (
                  <path d="M5 3.5h2.6v11H5zM10.4 3.5H13v11h-2.6z" fill="currentColor" />
                ) : (
                  <path d="M5.5 3.2v11.6L14.5 9z" fill="currentColor" />
                )}
              </svg>
            </button>
            <Slider
              className="piece-seek"
              min={0}
              max={Math.max(1, player.length)}
              step={0.25}
              value={player.beat}
              onValueChange={(v) => player.seek(v as number)}
            >
              <SliderControl className="piece-seek-control">
                <SliderTrack className="piece-seek-track">
                  <SliderIndicator className="piece-seek-fill" />
                  <SliderThumb className="piece-seek-thumb" aria-label={t.pieces.position} />
                </SliderTrack>
              </SliderControl>
            </Slider>
            <span className="piece-time pb-mono">
              {clock(player.beat * spb)} / {clock(player.seconds)}
            </span>
          </div>
          <SegmentedControl
            className="piece-switch"
            aria-label={t.pieces.version}
            value={version}
            onValueChange={(v) => v && setVersion(v as Version)}
          >
            <SegmentedControlIndicator className="piece-switch-indicator" />
            {(['full', 'easy'] as const).map((v) => (
              <SegmentedControlItem key={v} value={v} className="piece-switch-item">
                {t.pieces.versions[v]}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </section>

        <section className="app-home-section" aria-labelledby="piece-path">
          <h2 id="piece-path" className="pb-h2">
            {t.pieces.pathTitle}
          </h2>
          <ol className="pb-path">
            {path.map((s, i) => (
              <LessonRow
                key={s.lesson.id}
                // Auf der Stückseite genügt der Teil; der Titel steht darüber
                lesson={{ ...s.lesson, title: s.label }}
                index={i}
                done={lessonDone(s.lesson)}
                isNext={s === next}
                onOpen={() => (player.pause(), onOpen(s.lesson))}
              />
            ))}
          </ol>
          <p className="pb-note">{t.pieces.pathNote}</p>
        </section>

        <section className="app-home-section" aria-labelledby="piece-hands">
          <h2 id="piece-hands" className="pb-h2">
            {t.pieces.handsTitle}
          </h2>
          <p className="pb-small">{t.pieces.handsNote}</p>
          <ul className="piece-parts">
            {piece.parts.map((p, i) => {
              const lo = Math.min(...p.notes.map((n) => n.midi))
              const hi = Math.max(...p.notes.map((n) => n.midi))
              return (
                <li key={i} className="piece-part">
                  <span className="piece-part-name">
                    {p.name || t.pieces.part(i + 1)}
                    <span className="pb-mono">{t.pieces.partMeta(p.notes.length, displayNoteLabel(lo), displayNoteLabel(hi))}</span>
                  </span>
                  <SegmentedControl
                    className="piece-switch piece-hand"
                    aria-label={p.name || t.pieces.part(i + 1)}
                    value={p.hand}
                    onValueChange={(v) => v && setHand(i, v as PartHand)}
                  >
                    <SegmentedControlIndicator className="piece-switch-indicator" />
                    {HANDS.map((h) => (
                      <SegmentedControlItem key={h} value={h} className={`piece-switch-item hand-${h}`}>
                        {t.pieces.hand[h]}
                      </SegmentedControlItem>
                    ))}
                  </SegmentedControl>
                </li>
              )
            })}
          </ul>
          {splitUsed && (
            <div className="piece-split">
              <span className="piece-part-name">
                {t.pieces.split}
                <span className="pb-mono" aria-live="polite">
                  {t.pieces.splitHint(displayNoteLabel(piece.split))}
                </span>
              </span>
              <span className="piece-split-buttons">
                <button type="button" className="pb-btn pb-btn-ghost pb-btn-sm" onClick={() => update({ split: piece.split - 1 })}>
                  {t.pieces.lower}
                </button>
                <button type="button" className="pb-btn pb-btn-ghost pb-btn-sm" onClick={() => update({ split: piece.split + 1 })}>
                  {t.pieces.higher}
                </button>
              </span>
            </div>
          )}
        </section>

        <footer className="piece-foot">
          <AlertDialog>
            <AlertDialogTrigger className="piece-remove">{t.pieces.remove}</AlertDialogTrigger>
            <AlertDialogBackdrop className="dialog-backdrop" />
            <AlertDialogContent className="dialog piece-confirm">
              <AlertDialogTitle className="dialog-title">{t.pieces.removeTitle(piece.title)}</AlertDialogTitle>
              <AlertDialogDescription className="dialog-desc">{t.pieces.removeBody}</AlertDialogDescription>
              <div className="piece-confirm-actions">
                <AlertDialogClose className="pb-btn pb-btn-ghost">{t.pieces.cancel}</AlertDialogClose>
                <AlertDialogClose
                  className="pb-btn pb-btn-danger"
                  onClick={() => {
                    player.pause()
                    onBack()
                    pieces.remove(piece.id)
                  }}
                >
                  {t.pieces.removeConfirm}
                </AlertDialogClose>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        </footer>
      </main>
    </div>
  )
}
