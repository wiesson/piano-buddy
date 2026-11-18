import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { audioContext } from '../audio/audio'
import { HomeScreen } from '../ui/home/HomeScreen'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const { synced } = Route.useRouteContext()
  const navigate = useNavigate()
  return (
    <HomeScreen
      synced={synced}
      onOpen={(l) => {
        // Der Tipp ist die Geste, mit der Browser Klang erlauben
        audioContext()
        void navigate({ to: '/play/$lessonId', params: { lessonId: l.id } })
      }}
    />
  )
}
