import { useEffect, useRef, useState } from 'react'
import { Progress, ProgressIndicator, ProgressTrack } from '@ui-sdk/react/progress'
import type { Stage } from '@piano/core/music/lessons'
import type { PassResult } from '@piano/core/practice/session'
import { CLEAN_GOAL } from '@piano/core/practice/goal'
import { audioContext } from '@piano/core/audio/audio'
import { t } from '@piano/core/i18n'

/** So lange zählt die Karte herunter, bevor es von selbst weitergeht */
const COUNTDOWN_MS = 3000

/**
 * Karte nach einem Durchgang: sauber oder nicht, Stand der Stufe, was als Nächstes kommt.
 * Nach 3 Sekunden geht es von selbst weiter (egal ob sauber oder nicht): nochmal, nächste Stufe
 * oder nächstes Stück. Die Zahl im Knopf rollt 3 · 2 · 1, unten läuft eine Zündschnur leer
 * (Progress aus dem UI SDK, für Screenreader mit Wert), dazu ein kurzer Ton wie in der
 * Workouts-App. Ist das Mikrofon an, bleibt es still: Es würde den Ton als gespielte Note hören.
 */
export function ResultCard({
  result,
  stage,
  nextStage,
  clean,
  onAgain,
  onNext,
  onNextLesson,
  silent = false,
}: {
  result: PassResult
  stage: Stage
  nextStage?: Stage
  clean: number
  onAgain: () => void
  onNext: (s: Stage) => void
  onNextLesson?: () => void
  /** Kein Countdown-Ton (Mikrofon hört zu) */
  silent?: boolean
}) {
  const done = clean >= CLEAN_GOAL
  // Was „weiter“ bedeutet: nächste Stufe, nächstes Stück, sonst nochmal
  const primary =
    done && nextStage
      ? { label: t.practice.continueWith(t.stage[nextStage]), run: () => onNext(nextStage) }
      : done && onNextLesson
        ? { label: t.practice.nextLesson, run: onNextLesson }
        : { label: t.practice.again, run: onAgain }
  const showAgain = primary.run !== onAgain

  const [remaining, setRemaining] = useState(COUNTDOWN_MS)
  const [running, setRunning] = useState(true)
  const primaryRef = useRef(primary.run)
  primaryRef.current = primary.run
  const seconds = Math.max(1, Math.ceil(remaining / 1000))

  useEffect(() => {
    if (!running) return
    let raf = 0
    const end = performance.now() + remaining
    const loop = () => {
      const left = end - performance.now()
      if (left <= 0) {
        setRemaining(0)
        setRunning(false)
        primaryRef.current()
        return
      }
      setRemaining(left)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // remaining nur beim Start lesen: weiterzählen ab dem Stand beim Fortsetzen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  // Ton bei 3, 2, 1
  useEffect(() => {
    if (!running || silent || remaining <= 0) return
    tick()
  }, [seconds, running, silent]) // eslint-disable-line react-hooks/exhaustive-deps

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
      {result.short > 0 && <p className="result-note">{t.practice.shortNote(result.short)}</p>}
      <p className="result-hint">{done && nextStage ? t.practice.keepPlayingNext(t.stage[nextStage]) : t.practice.keepPlaying}</p>
      <div className="result-actions">
        <button className="primary result-go" onClick={primary.run}>
          {running && (
            <span className="result-count" aria-hidden="true">
              <span key={seconds} className="result-count-n">
                {seconds}
              </span>
            </span>
          )}
          {primary.label}
        </button>
        {showAgain && (
          <button className="secondary" onClick={onAgain}>
            {t.practice.again}
          </button>
        )}
        {running ? (
          <button className="result-pause" onClick={() => setRunning(false)}>
            {t.practice.pause}
          </button>
        ) : null}
      </div>
      {running && (
        <Progress
          className="result-fuse"
          value={(remaining / COUNTDOWN_MS) * 100}
          aria-label={t.practice.autoNext(seconds)}
        >
          <ProgressTrack className="result-fuse-track">
            <ProgressIndicator className="result-fuse-fill" />
          </ProgressTrack>
        </Progress>
      )}
    </div>
  )
}

/** Kurzer, leiser Ton (760 Hz, 90 ms) wie der Countdown in der Workouts-App */
function tick() {
  try {
    const ctx = audioContext()
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 760
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.14, t0 + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + 0.1)
  } catch {
    // ohne Ton geht es genauso
  }
}
