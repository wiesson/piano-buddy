import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { store } from '@piano/core/sync/store'

/**
 * Messungen hochladen (Lernmodus „Messung senden“, Diagnose-Modus beim Üben). Nur verfügbar,
 * wenn Sync läuft; sonst liefert useReportUpload null.
 */
export type UploadReport = (kind: string, summary: string, data: Blob, audio: Blob | null) => Promise<string>

const UploadContext = createContext<UploadReport | null>(null)

export function ReportUploadProvider({ children }: { children: ReactNode }) {
  const uploadUrl = useMutation(api.reports.uploadUrl)
  const save = useMutation(api.reports.save)
  const upload = useCallback<UploadReport>(
    async (kind, summary, data, audio) => {
      const { token } = store.device()
      const put = async (blob: Blob) => {
        const url = await uploadUrl({ token })
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': blob.type || 'application/octet-stream' },
          body: blob,
        })
        if (!res.ok) throw new Error(`Upload ${res.status}`)
        return ((await res.json()) as { storageId: Id<'_storage'> }).storageId
      }
      const dataId = await put(data)
      const audioId = audio && audio.size ? await put(audio) : undefined
      const id = await save({ token, kind, summary, dataId, audioId })
      return id.slice(-6)
    },
    [uploadUrl, save],
  )
  return <UploadContext.Provider value={upload}>{children}</UploadContext.Provider>
}

export const useReportUpload = () => useContext(UploadContext)
