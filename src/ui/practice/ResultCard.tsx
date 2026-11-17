import type { Stage } from '../../music/lessons'
import type { PassResult } from '../../practice/session'
import { CLEAN_GOAL } from '../../practice/goal'
import { t } from '../../i18n'

/** Karte nach einem Durchgang: sauber oder nicht, Stand der Stufe, was als Nächstes kommt */
export function ResultCard({
  result,
  stage,
  nextStage,
  clean,
  onAgain,
  onNext,
}: {
  result: PassResult
  stage: Stage
  nextStage?: Stage
  clean: number
  onAgain: () => void
  onNext: (s: Stage) => void
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
      <div className="result-actions">
        <button className="primary" onClick={onAgain}>
          {t.practice.again}
        </button>
        {done && nextStage && (
          <button className="secondary" onClick={() => onNext(nextStage)}>
            {t.practice.continueWith(t.stage[nextStage])}
          </button>
        )}
      </div>
    </div>
  )
}
