import { isBlack } from '../../music/notes'
import type { Lesson } from '../../music/lessons'
import { localized, t } from '../../i18n'

const W = 320
const KEYS_H = 46
const ROLL_H = 250
const BEATS = 8

/**
 * Ein Blick in die App, gezeichnet aus echten Lektionsdaten: die ersten Takte als fallende Noten
 * in den Handfarben über einer Klaviatur. Statisch, ohne Canvas, damit es auch ohne App-Start trägt.
 */
export function RollPreview({ lesson, onOpen }: { lesson: Lesson; onOpen: () => void }) {
  const notes = lesson.notes.filter((n) => n.start < BEATS)
  const lo = Math.min(...notes.map((n) => n.midi)) - 2
  const hi = Math.max(...notes.map((n) => n.midi)) + 2
  // Weiße Tasten bestimmen die Breite, schwarze liegen auf der Grenze dazwischen
  const whites: number[] = []
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m)
  const kw = W / whites.length
  const xOf = (m: number) => {
    const i = whites.findIndex((w) => w >= m)
    return isBlack(m) ? i * kw - kw * 0.3 : i * kw
  }
  const wOf = (m: number) => (isBlack(m) ? kw * 0.6 : kw)
  const pxPerBeat = ROLL_H / BEATS

  return (
    <button type="button" className="roll-card" onClick={onOpen}>
      <span className="roll-head">
        <span>{localized(lesson.title)}</span>
        <span>{t.home.roll(lesson.bpm)}</span>
      </span>
      <svg viewBox={`0 0 ${W} ${ROLL_H + KEYS_H}`} className="roll-svg" aria-hidden="true">
        {whites.map((m, i) =>
          m % 12 === 0 ? <line key={m} x1={i * kw} x2={i * kw} y1={0} y2={ROLL_H} className="roll-octave" /> : null,
        )}
        {notes.map((n, i) => {
          const y = ROLL_H - (n.start + n.dur) * pxPerBeat
          return (
            <rect
              key={i}
              x={xOf(n.midi) + 1.5}
              y={y + 1.5}
              width={wOf(n.midi) - 3}
              height={n.dur * pxPerBeat - 3}
              rx={4}
              className={n.hand === 'L' ? 'roll-l' : 'roll-r'}
            />
          )
        })}
        <rect x={0} y={ROLL_H} width={W} height={2} className="roll-felt" />
        {whites.map((m, i) => (
          <rect key={m} x={i * kw + 0.75} y={ROLL_H + 2} width={kw - 1.5} height={KEYS_H - 2} rx={3} className="roll-white" />
        ))}
        {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
          .filter(isBlack)
          .map((m) => (
            <rect key={m} x={xOf(m)} y={ROLL_H + 2} width={wOf(m)} height={KEYS_H * 0.6} rx={2} className="roll-black" />
          ))}
      </svg>
      <span className="roll-foot">
        <span className="roll-legend roll-legend-l">{t.home.legendL}</span>
        <span className="roll-legend roll-legend-r">{t.home.legendR}</span>
      </span>
    </button>
  )
}
