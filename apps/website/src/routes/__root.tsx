import { createRootRoute, Outlet } from '@tanstack/react-router'
import { useStoreVersion } from '@piano/ui/hooks/useStoreVersion'

export const Route = createRootRoute({ component: Root })

function Root() {
  // Fortschritt liegt im Browser (gleiche Domain wie die App): neu zeichnen, wenn er sich ändert
  useStoreVersion()
  return <Outlet />
}
