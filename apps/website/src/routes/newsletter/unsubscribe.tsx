import { useCallback } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { t } from '@piano/core/i18n'
import { unsubscribe } from '../../newsletter/client'
import { NewsletterResult } from '../../ui/NewsletterResult'

/** Abmeldelink aus jeder Mail */
export const Route = createFileRoute('/newsletter/unsubscribe')({
  validateSearch: (s: Record<string, unknown>) => ({ token: typeof s.token === 'string' ? s.token : '' }),
  component: Unsubscribe,
})

function Unsubscribe() {
  const { token } = Route.useSearch()
  const run = useCallback(() => unsubscribe(token), [token])
  return <NewsletterResult run={run} okTitle={t.launch.unsubTitle} okBody={t.launch.unsubBody} failBody={t.launch.unsubFailed} />
}
