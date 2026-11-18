import { useEffect, useState } from 'react'
import { useConvex } from 'convex/react'
import { store } from '@piano/core/sync/store'
import { useStoreVersion } from '@piano/ui/hooks/useStoreVersion'

export { useStoreVersion }

/** Verbunden? Wie viele Durchgänge warten noch aufs Hochladen? */
export function useSyncStatus() {
  const convex = useConvex()
  useStoreVersion()
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const check = () => setOnline(convex.connectionState().isWebSocketConnected)
    check()
    const t = window.setInterval(check, 2000)
    return () => clearInterval(t)
  }, [convex])
  return { online, pending: store.unsynced().length }
}
