import { httpRouter } from 'convex/server'
import { api } from './_generated/api'
import { httpAction } from './_generated/server'

const http = httpRouter()

/**
 * Abmelden mit einem Klick aus dem Mailprogramm (RFC 8058: List-Unsubscribe-Post). Gmail und
 * Apple Mail schicken einen POST an die Adresse aus dem Header; ein GET landet ebenso hier.
 */
const unsubscribe = httpAction(async (ctx, req) => {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const r = await ctx.runMutation(api.newsletter.unsubscribe, { token })
  return new Response(r.ok ? 'Unsubscribed' : 'Unknown link', { status: r.ok ? 200 : 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
})
http.route({ path: '/newsletter/unsubscribe', method: 'POST', handler: unsubscribe })
http.route({ path: '/newsletter/unsubscribe', method: 'GET', handler: unsubscribe })

export default http
