import { useState } from 'react'
import { LESSONS, stageLabel, stagesFor, type Lesson } from './music/lessons'
import { CLEAN_GOAL } from './practice/goal'
import { Practice } from './ui/Practice'
import { audioContext } from './audio/audio'
import { store } from './sync/store'
import { DevicesDialog, useStoreVersion } from './sync/Sync'
import { Logo } from './ui/Logo'

export function App({ synced }: { synced: boolean }) {
  const [lesson, setLesson] = useState<Lesson | null>(null)
  useStoreVersion()
  if (lesson) return <Practice lesson={lesson} onBack={() => setLesson(null)} />
  return <Home synced={synced} onOpen={(l) => (audioContext(), setLesson(l))} />
}

function Home({ onOpen, synced }: { onOpen: (l: Lesson) => void; synced: boolean }) {
  const doneAll = (l: Lesson) => stagesFor(l).every((s) => store.cleanCount(l.id, s) >= CLEAN_GOAL)
  const next = LESSONS.find((l) => !doneAll(l))

  return (
    <div className="home">
      {/* Feste App-Leiste wie eine Tastenklappe: Signet und Schriftzug mittig, Filzstreifen darunter */}
      <header className="appbar">
        <span className="appbar-side" />
        <h1 className="appbar-brand">
          <Logo size={26} />
          <span>Piano Buddy</span>
        </h1>
        <span className="appbar-side appbar-end">{synced && <DevicesDialog />}</span>
      </header>

      <p className="lede">
        Jedes Stück in drei Stufen: erst links, dann rechts, dann beide Hände. Eine Stufe sitzt nach drei sauberen
        Durchgängen.
      </p>

      <ol className="path">
        {LESSONS.map((l, i) => {
          const stages = stagesFor(l)
          const isNext = l === next
          return (
            <li key={l.id} className={`step ${doneAll(l) ? 'done' : ''} ${isNext ? 'next' : ''}`}>
              <button className="lesson" onClick={() => onOpen(l)}>
                <span className="node" aria-hidden>
                  {doneAll(l) ? '✓' : i + 1}
                </span>
                <span className="body">
                  <span className="name">
                    <span className="sr-only">{i + 1}. </span>
                    {l.title}
                    {isNext && <span className="next-tag">Als Nächstes</span>}
                  </span>
                  <span className="goal">{l.goal}</span>
                </span>
                <span className="mini-stages">
                  {stages.map((s) => {
                    const c = store.cleanCount(l.id, s)
                    return (
                      <span key={s} className={`mini mini-${s} ${c >= CLEAN_GOAL ? 'full' : c > 0 ? 'some' : ''}`}>
                        {stageLabel[s]}
                      </span>
                    )
                  })}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <footer className="hint">
        <p>
          Stell das iPhone oder iPad aufs Notenpult und tippe im Stück auf „Mikrofon“. Am Mac in Chrome und in der
          iOS-App geht auch „MIDI“. Ohne Klavier spielst du auf dem Bildschirm oder mit der Tastatur (Y–M und Q–I).
        </p>
      </footer>
    </div>
  )
}
