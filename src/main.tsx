import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { SyncBridge } from './sync/SyncBridge'
import { Toasts } from './ui/shared/Toaster'
import './styles/index.css'

// Ohne Convex-Adresse läuft die App rein lokal (Fortschritt nur auf diesem Gerät).
const url = import.meta.env.VITE_CONVEX_URL as string | undefined
const convex = url ? new ConvexReactClient(url) : null

const router = createRouter({
  routeTree,
  context: { synced: !!convex },
  // Zurück aus einem Stück landet an derselben Stelle der Startseite
  scrollRestoration: true,
  // Übe-Seite schon laden, wenn der Zeiger auf einem Stück liegt
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const app = <RouterProvider router={router} />

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {convex ? (
      <ConvexProvider client={convex}>
        <SyncBridge />
        {app}
      </ConvexProvider>
    ) : (
      app
    )}
    <Toasts />
  </StrictMode>,
)
