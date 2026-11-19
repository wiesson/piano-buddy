import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../convex/_generated/api'

/** Launch-Liste im Convex von Piano Buddy (ohne Live-Verbindung: drei einzelne Aufrufe genügen) */
const url = import.meta.env.VITE_CONVEX_URL as string | undefined
const client = url ? new ConvexHttpClient(url) : null

const need = () => {
  if (!client) throw new Error('VITE_CONVEX_URL fehlt')
  return client
}

export const subscribe = (args: { email: string; topics: ('launch' | 'updates')[]; locale: 'de' | 'en'; website?: string }) =>
  need().mutation(api.newsletter.subscribe, { ...args, source: 'website' })
export const confirm = (token: string) => need().mutation(api.newsletter.confirm, { token })
export const unsubscribe = (token: string) => need().mutation(api.newsletter.unsubscribe, { token })
