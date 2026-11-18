import { useSyncExternalStore } from 'react'
import { store } from '@piano/core/sync/store'

/** Neu rendern, sobald sich das Übungsprotokoll oder das Gerät ändert */
export const useStoreVersion = () => useSyncExternalStore(store.subscribe, store.version)
