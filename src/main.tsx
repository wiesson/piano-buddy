import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { App } from './App'
import { SyncBridge } from './sync/SyncBridge'
import { Toasts } from './ui/shared/Toaster'
import './styles/index.css'

// Ohne Convex-Adresse läuft die App rein lokal (Fortschritt nur auf diesem Gerät).
const url = import.meta.env.VITE_CONVEX_URL as string | undefined
const convex = url ? new ConvexReactClient(url) : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {convex ? (
      <ConvexProvider client={convex}>
        <SyncBridge />
        <App synced />
      </ConvexProvider>
    ) : (
      <App synced={false} />
    )}
    <Toasts />
  </StrictMode>,
)
