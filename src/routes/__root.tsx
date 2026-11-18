import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { useStoreVersion } from '../sync/hooks'

export interface RouterContext {
  /** Läuft Convex-Sync? Ohne Adresse bleibt alles auf dem Gerät */
  synced: boolean
}

export const Route = createRootRouteWithContext<RouterContext>()({ component: Root })

function Root() {
  // Neue Durchgänge (auch von anderen Geräten) zeichnen alle Seiten neu
  useStoreVersion()
  return <Outlet />
}
