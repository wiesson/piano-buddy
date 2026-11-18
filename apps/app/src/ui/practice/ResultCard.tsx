import type { Stage } from '@piano/core/music/lessons'
import type { PassResult } from '@piano/core/practice/session'
import { nextTempo, slowerTempo, type Tempo, type TempoResult } from '@piano/core/practice/tempo'
import { CLEAN_GOAL } from '@piano/core/practice/goal'
import { starsFor, type Best, type Praise } from '@piano/core/practice/score'
import { Stars } from '@piano/ui/shared/Stars'
import { t } from '@piano/core/i18n'
import { tempoLabel } from './StageMenu'

const isTempo = (r: PassResult | TempoResult): r is TempoResult => 'tempo' in r

/**
 * Karte nach einem Durchgang, oben in der Bahn: Die Klaviatur bleibt frei, wer mit MIDI spielt,
 * spielt einfach weiter (die nächste Taste startet den nächsten Durchgang). Höchstens drei Zeilen:
 * Sterne und Ergebnis, was gut und was knapp war, eine Zeile Fortschritt oder Lob. Kein
 * Countdown mehr: Er drängte und lag über den Tasten.
 *
 * Mitspielen: Nach einem sauberen Durchgang bietet die Karte die nächste Tempo-Stufe an, nach
 * einem schwachen (unter ★) die langsamere.
 */
export function ResultCard({
  result,
  stage,
  nextStage,
  clean,
  onAgain,
  onNext,
  onNextLesson,
  onTempo,
  tempo,
  cleanTempos,
  note,
  best,
  praise,
}: {
  result: PassResult | TempoResult
  stage: Stage
  nextStage?: Stage
  clean: number
  onAgain: () => void
  onNext: (s: Stage) => void
  onNextLesson?: () => void
  onTempo: (t: Tempo) => void
  /** Tempo dieses Durchgangs und Tempi, die auf dieser Stufe schon sauber gingen */
  tempo: Tempo
  cleanTempos: Set<Tempo>
  note?: string
  best?: Best | null
  praise?: Praise | null
}) {
  const done = clean >= CLEAN_GOAL
  const stars = starsFor(result.percent, result.clean)
  const tempoRun = isTempo(result) ? result : null
  // Sauber: die nächste Tempo-Stufe anbieten, solange sie noch nicht geschafft ist (auch aus dem
  // Warte-Modus heraus); schwach (unter ★) beim Mitspielen: die langsamere
  const up = result.clean ? nextTempo(tempo) : null
  const faster = up && !cleanTempos.has(up) ? up : null
  const slower = tempoRun && !tempoRun.clean && stars === 0 ? slowerTempo(tempo) : null

  const primary = faster
    ? { label: t.tempo.next(tempoLabel(faster)), run: () => onTempo(faster) }
    : done && nextStage
      ? { label: t.practice.continueWith(t.stage[nextStage]), run: () => onNext(nextStage) }
      : done && onNextLesson
        ? { label: t.practice.nextLesson, run: onNextLesson }
        : { label: t.practice.again, run: onAgain }
  const secondary =
    primary.run !== onAgain
      ? { label: t.practice.again, run: onAgain }
      : slower
        ? { label: t.tempo.slower, run: () => onTempo(slower) }
        : null

  // Zeile 1: Anschlag (Mitspielen) bzw. Fortschritt der Stufe (Warten)
  const line1 = tempoRun
    ? [
        t.tempo.onTime(tempoRun.onTime, tempoRun.onTime + tempoRun.near + tempoRun.missed),
        tempoRun.near ? t.tempo.near(tempoRun.near) : '',
        tempoRun.missed ? t.tempo.missed(tempoRun.missed) : '',
        tempoRun.wrong ? t.tempo.wrong(tempoRun.wrong) : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : done
      ? nextStage
        ? t.practice.stageDone(t.stage[stage], t.stage[nextStage])
        : stage === 'LR'
          ? t.practice.allDone
          : t.practice.stageDoneLast(t.stage[stage])
      : t.practice.progress(clean, CLEAN_GOAL)
  // Zeile 2: Haltedauer und Tempo-Gefühl (Mitspielen) bzw. Hinweise (Warten)
  const line2 = tempoRun
    ? [
        !tempoRun.holdGraded
          ? t.tempo.holdMic
          : tempoRun.short || tempoRun.long
            ? t.tempo.hold(tempoRun.short, tempoRun.long)
            : t.tempo.holdOk,
        tempoRun.drift ? t.tempo.drift(tempoRun.drift.bar, tempoRun.drift.ms < 0) : '',
      ]
        .filter(Boolean)
        .join(' ')
    : result.short > 0
      ? t.practice.shortNote(result.short)
      : result.unverified > 0
        ? t.practice.unverified(result.unverified)
        : ''
  // Zeile 3: Fortschritt im Plan oder Lob für etwas Neues
  const line3 =
    note ??
    (praise
      ? praise.kind === 'stars'
        ? t.practice.praiseStars('')
        : praise.kind === 'best'
          ? t.practice.praiseBest
          : t.practice.praiseBar(praise.bar)
      : tempoRun
        ? (done ? '' : t.practice.progress(clean, CLEAN_GOAL))
        : '')

  return (
    <div className="result" role="status">
      <div className="result-top">
        <p className="result-head">{result.clean ? t.practice.resultClean : t.tempo.percent(result.percent)}</p>
        <Stars n={stars} className="result-stars" />
        {best && best.percent > result.percent && <span className="result-best">{t.practice.best(best.percent)}</span>}
      </div>
      <p className="result-line">{line1}</p>
      {line2 && <p className="result-line">{line2}</p>}
      {line3 && (
        <p className="result-line result-praise">
          {line3}
          {!note && praise?.kind === 'stars' && <Stars n={praise.stars} earnedOnly />}
        </p>
      )}
      <div className="result-actions">
        <button type="button" className="primary" onClick={primary.run}>
          {primary.label}
        </button>
        {secondary && (
          <button type="button" className="secondary" onClick={secondary.run}>
            {secondary.label}
          </button>
        )}
        <span className="result-hint">{t.tempo.keepPlaying}</span>
      </div>
    </div>
  )
}
