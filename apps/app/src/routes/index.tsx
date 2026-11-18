import { createFileRoute } from '@tanstack/react-router'
import { AppHome } from '../ui/home/AppHome'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const { synced } = Route.useRouteContext()
  return <AppHome synced={synced} />
}
