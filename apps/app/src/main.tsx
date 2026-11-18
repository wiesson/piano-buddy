import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { SyncBridge } from './sync/SyncBridge'
import { ReportUploadProvider } from './diagnostics/upload'
import { Toasts } from '@piano/ui/shared/Toaster'
import './styles/index.css'

// App statt Website: kein Kontextmenü (Rechtsklick, langer Druck), außer in Eingabefeldern.
// Der leere touchstart-Lauscher lässt iOS :active beim Antippen sofort zeigen.
document.addEventListener('contextmenu', (e) => {
  const el = e.target as HTMLElement | null
  if (!el?.closest('input, textarea, [contenteditable="true"]')) e.preventDefault()
})
document.addEventListener('touchstart', () => {}, { passive: true })

// Entwicklung: UI-SDK-Agenten-Brücke für Tests und Erkundung (window.pianoAgent)
if (import.meta.env.DEV) void import('./diagnostics/agent')

// Ohne Convex-Adresse läuft die App rein lokal (Fortschritt nur auf diesem Gerät).
const url = import.meta.env.VITE_CONVEX_URL as string | undefined
const convex = url ? new ConvexReactClient(url) : null

const router = createRouter({
  routeTree,
  // Web: /app (eigener Worker), iOS gebündelt: /
  basepath: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
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
        <ReportUploadProvider>{app}</ReportUploadProvider>
      </ConvexProvider>
    ) : (
      app
    )}
    <Toasts />
  </StrictMode>,
)
