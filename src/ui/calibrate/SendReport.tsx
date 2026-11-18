import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { store } from '../../sync/store'
import { t } from '../../i18n'

/**
 * „Messung senden“: Messwerte und Aufnahme gehen auf ausdrücklichen Tipp an Piano Buddy (Convex),
 * damit wir die Erkennung an echten Klavieren verbessern. Nur gerendert, wenn Sync läuft.
 */
export function SendReport({ data, audio, summary }: { data: () => Blob; audio: Blob | null; summary: () => string }) {
  const uploadUrl = useMutation(api.reports.uploadUrl)
  const save = useMutation(api.reports.save)
  const [state, setState] = useState<{ kind: 'idle' | 'sending' | 'error' } | { kind: 'sent'; id: string }>({ kind: 'idle' })

  const put = async (token: string, blob: Blob) => {
    const url = await uploadUrl({ token })
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob })
    if (!res.ok) throw new Error(`Upload ${res.status}`)
    return ((await res.json()) as { storageId: Id<'_storage'> }).storageId
  }

  const send = async () => {
    const { token } = store.device()
    setState({ kind: 'sending' })
    try {
      const dataId = await put(token, data())
      const audioId = audio ? await put(token, audio) : undefined
      const id = await save({ token, kind: 'calibration', summary: summary(), dataId, audioId })
      setState({ kind: 'sent', id: id.slice(-6) })
    } catch (e) {
      console.warn('Messung senden', e)
      setState({ kind: 'error' })
    }
  }

  return (
    <div className="calib-send">
      {state.kind === 'sent' ? (
        <p className="calib-small">{t.calib.sent(state.id)}</p>
      ) : (
        <>
          <button type="button" className="ghost" onClick={send} disabled={state.kind === 'sending'}>
            {state.kind === 'sending' ? t.calib.sending : t.calib.send}
          </button>
          <p className="calib-small">{state.kind === 'error' ? t.calib.sendFailed : t.calib.sendNote}</p>
        </>
      )}
    </div>
  )
}
