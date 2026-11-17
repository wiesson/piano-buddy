import type { BenchStats } from '../../practice/bench'
import { t } from '../../i18n'
import { displayNoteLabel } from '../../i18n/noteNames'

/** Live-Messung „Mikrofon gegen MIDI“, solange beide Eingänge laufen */
export function BenchPanel({
  bench,
  calibrating,
  onReset,
}: {
  bench: BenchStats
  calibrating: boolean
  onReset: () => void
}) {
  return (
    <aside className="bench" aria-live="polite">
      <p className="bench-head">{t.bench.title}</p>
      <p className="bench-main">
        {bench.played ? (
          <>
            <strong>{t.bench.detected(bench.detected, bench.played)}</strong> {t.bench.detectedSuffix}
            {bench.medianLatencyMs !== null && <> · {bench.medianLatencyMs} ms</>}
            {bench.falseAlarms > 0 && <> · {t.bench.falseAlarms(bench.falseAlarms)}</>}
          </>
        ) : calibrating ? (
          t.bench.calibrating
        ) : (
          t.bench.waiting
        )}
      </p>
      {bench.recent.length > 0 && (
        <ul className="bench-log">
          {bench.recent.map((e, i) => (
            <li key={i} className={`bench-${e.kind}`}>
              {displayNoteLabel(e.midi)}{' '}
              {e.kind === 'hit' ? t.bench.hit(e.latencyMs ?? 0) : e.kind === 'missed' ? t.bench.missed : t.bench.falseAlarm(e.relation && t.bench.relation(e.relation.kind, displayNoteLabel(e.relation.of)))}
            </li>
          ))}
        </ul>
      )}
      <button className="bench-reset" onClick={onReset}>
        {t.bench.reset}
      </button>
    </aside>
  )
}
