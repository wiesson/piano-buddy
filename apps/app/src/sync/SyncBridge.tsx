import { useEffect, useRef } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { store } from '@piano/core/sync/store'
import { useStoreVersion } from './hooks'

/**
 * Unsichtbar: meldet das Gerät an, lädt neue Durchgänge hoch und mischt die der anderen
 * Geräte ein. Läuft nur, wenn eine Convex-Adresse konfiguriert ist.
 */
export function SyncBridge() {
  const version = useStoreVersion()
  const dev = store.device()
  const register = useMutation(api.sync.register)
  const push = useMutation(api.sync.pushAttempts)
  const remote = useQuery(api.sync.attempts, dev.registered ? { token: dev.token } : 'skip')
  const inflight = useRef(false)

  useEffect(() => {
    if (dev.registered) return
    register({ token: dev.token, label: dev.label })
      .then(() => store.setDevice({ registered: true }))
      .catch((e) => console.warn('Anmelden', e))
  }, [dev.registered, dev.token, dev.label, register])

  useEffect(() => {
    if (remote) store.mergeRemote(remote)
    // Server kennt das Gerät nicht (mehr): neu anmelden, die lokalen Durchgänge gehen wieder hoch
    if (remote === null) store.setDevice({ registered: false })
  }, [remote])

  useEffect(() => {
    if (!dev.registered) return
    const flush = async () => {
      if (inflight.current) return
      const batch = store.unsynced()
      if (!batch.length) return
      inflight.current = true
      try {
        await push({ token: dev.token, attempts: batch })
        store.markSynced(batch.map((a) => a.attemptId))
      } catch (e) {
        console.warn('Hochladen', e)
      } finally {
        inflight.current = false
      }
    }
    void flush()
    const t = window.setInterval(flush, 15000)
    window.addEventListener('online', flush)
    return () => {
      clearInterval(t)
      window.removeEventListener('online', flush)
    }
  }, [version, dev.registered, dev.token, push])

  return null
}
