import type { Stage } from '@piano/core/music/lessons'
import type { PassResult } from '@piano/core/practice/session'
import { CLEAN_GOAL } from '@piano/core/practice/goal'
import { t } from '@piano/core/i18n'

/** Karte nach einem Durchgang: sauber oder nicht, Stand der Stufe, was als Nächstes kommt */
export function ResultCard({
  result,
  stage,
  nextStage,
  clean,
  onAgain,
  onNext,
  onNextLesson,
}: {
  result: PassResult
  stage: Stage
  nextStage?: Stage
  clean: number
  onAgain: () => void
  onNext: (s: Stage) => void
  onNextLesson?: () => void
}) {
  const done = clean >= CLEAN_GOAL
  return (
    <div className="result" role="status">
      <p className="result-head">{result.clean ? t.practice.resultClean : t.practice.resultWrong(result.wrong)}</p>
      <p className="result-sub">
        {done
          ? nextStage
            ? t.practice.stageDone(t.stage[stage], t.stage[nextStage])
            : stage === 'LR'
              ? t.practice.allDone
              : t.practice.stageDoneLast(t.stage[stage])
          : t.practice.progress(clean, CLEAN_GOAL)}
      </p>
      {result.unverified > 0 && <p className="result-note">{t.practice.unverified(result.unverified)}</p>}
      <p className="result-hint">{done && nextStage ? t.practice.keepPlayingNext(t.stage[nextStage]) : t.practice.keepPlaying}</p>
      <div className="result-actions">
        {done && nextStage ? (
          <>
            <button className="primary" onClick={() => onNext(nextStage)}>
              {t.practice.continueWith(t.stage[nextStage])}
            </button>
            <button className="secondary" onClick={onAgain}>
              {t.practice.again}
            </button>
          </>
        ) : done && onNextLesson ? (
          <>
            <button className="primary" onClick={onNextLesson}>
              {t.practice.nextLesson}
            </button>
            <button className="secondary" onClick={onAgain}>
              {t.practice.again}
            </button>
          </>
        ) : (
          <button className="primary" onClick={onAgain}>
            {t.practice.again}
          </button>
        )}
      </div>
    </div>
  )
}
