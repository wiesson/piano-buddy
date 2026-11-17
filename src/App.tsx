import { useState } from 'react'
import type { Lesson } from './music/lessons'
import { audioContext } from './audio/audio'
import { useStoreVersion } from './sync/hooks'
import { HomeScreen } from './ui/home/HomeScreen'
import { PracticeScreen } from './ui/practice/PracticeScreen'

export function App({ synced }: { synced: boolean }) {
  const [lesson, setLesson] = useState<Lesson | null>(null)
  useStoreVersion()
  if (lesson) return <PracticeScreen lesson={lesson} onBack={() => setLesson(null)} />
  // Der erste Tipp startet den AudioContext (Browser erlauben Klang erst nach einer Geste)
  return <HomeScreen synced={synced} onOpen={(l) => (audioContext(), setLesson(l))} />
}
