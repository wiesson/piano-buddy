import { createFileRoute } from '@tanstack/react-router'
import { HomeScreen } from '../ui/home/HomeScreen'

export const Route = createFileRoute('/')({ component: Home })

/** Ein Stück öffnen heißt: in die App wechseln (eigener Worker unter /app, gleiche Domain) */
const openInApp = (id: string) => window.location.assign(`/app/play/${id}`)

function Home() {
  return <HomeScreen onOpen={(l) => openInApp(l.id)} />
}
