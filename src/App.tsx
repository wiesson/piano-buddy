import { useState } from 'react'
import { LESSONS, stageLabel, stagesFor, type Lesson } from './music/lessons'
import { CLEAN_GOAL, cleanCount, loadProgress } from './practice/progress'
import { Practice } from './ui/Practice'
import { audioContext } from './audio/audio'

export function App() {
  const [lesson, setLesson] = useState<Lesson | null>(null)
  if (lesson) return <Practice lesson={lesson} onBack={() => setLesson(null)} />
  return <Home onOpen={(l) => (audioContext(), setLesson(l))} />
}

function Home({ onOpen }: { onOpen: (l: Lesson) => void }) {
  const progress = loadProgress()
  const doneAll = (l: Lesson) => stagesFor(l).every((s) => cleanCount(progress, l.id, s) >= CLEAN_GOAL)
  const next = LESSONS.find((l) => !doneAll(l))

  return (
    <div className="home">
      <header className="fallboard">
        <h1 className="brand">Piano Buddy</h1>
        <p className="lede">
          Jedes Stück in drei Stufen: erst links, dann rechts, dann beide Hände. Eine Stufe sitzt nach drei sauberen
          Durchgängen.
        </p>
      </header>

      <ol className="path">
        {LESSONS.map((l, i) => {
          const stages = stagesFor(l)
          const isNext = l === next
          return (
            <li key={l.id} className={`${doneAll(l) ? 'done' : ''} ${isNext ? 'next' : ''}`}>
              <button className="lesson" onClick={() => onOpen(l)}>
                <span className="num">{i + 1}</span>
                <span className="body">
                  <span className="name">{l.title}</span>
                  <span className="goal">{l.goal}</span>
                </span>
                <span className="mini-stages">
                  {stages.map((s) => {
                    const c = cleanCount(progress, l.id, s)
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
          Stell das iPhone oder iPad aufs Notenpult und tippe im Stück auf „Mikrofon an“. Am Mac in Chrome geht auch
          MIDI per USB-Kabel. Ohne Klavier spielst du auf dem Bildschirm oder mit der Tastatur (Y–M und Q–I).
        </p>
      </footer>
    </div>
  )
}
