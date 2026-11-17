import { useState } from 'react'
import { LESSONS, type Lesson } from './music/lessons'
import { audioContext } from './audio/audio'
import { useStoreVersion } from './sync/hooks'
import { HomeScreen } from './ui/home/HomeScreen'
import { PracticeScreen } from './ui/practice/PracticeScreen'

export function App({ synced }: { synced: boolean }) {
  const [lesson, setLesson] = useState<Lesson | null>(null)
  useStoreVersion()
  if (lesson) {
    const next = LESSONS[LESSONS.indexOf(lesson) + 1]
    return (
      <PracticeScreen
        key={lesson.id}
        lesson={lesson}
        onBack={() => setLesson(null)}
        onNextLesson={next ? () => setLesson(next) : undefined}
      />
    )
  }
  // Der erste Tipp startet den AudioContext (Browser erlauben Klang erst nach einer Geste)
  return <HomeScreen synced={synced} onOpen={(l) => (audioContext(), setLesson(l))} />
}
