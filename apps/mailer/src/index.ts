/**
 * Mailversand von pianobuddy.fyi für Convex. Convex hat keinen Zugriff auf Worker-Bindings, also
 * schickt es die fertige Mail hierher; der Worker sendet über Cloudflare Email Sending, ohne
 * API-Token. Nur mit dem gemeinsamen Geheimnis, nur ein Empfänger, nur vom festen Absender.
 */

interface Env {
  EMAIL: {
    send(m: {
      to: string
      from: { email: string; name: string }
      replyTo?: string
      subject: string
      html: string
      text: string
      headers?: Record<string, string>
    }): Promise<{ messageId: string }>
  }
  MAIL_SECRET: string
  REPLY_TO?: string
}

const FROM = { email: 'hallo@pianobuddy.fyi', name: 'Piano Buddy' }
const HEADERS = new Set(['List-Unsubscribe', 'List-Unsubscribe-Post'])

/** Vergleich in konstanter Zeit, damit die Antwortzeit das Geheimnis nicht verrät */
async function same(a: string, b: string) {
  const enc = new TextEncoder()
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))])
  const u = new Uint8Array(x)
  const v = new Uint8Array(y)
  let diff = 0
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i]
  return diff === 0
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname !== '/_mail/send' || req.method !== 'POST') return json({ error: 'not_found' }, 404)
    const auth = req.headers.get('Authorization') ?? ''
    if (!env.MAIL_SECRET || !(await same(auth, `Bearer ${env.MAIL_SECRET}`))) return json({ error: 'unauthorized' }, 401)

    const m = (await req.json().catch(() => null)) as { to?: unknown; subject?: unknown; html?: unknown; text?: unknown; headers?: Record<string, unknown> } | null
    if (!m || typeof m.to !== 'string' || typeof m.subject !== 'string' || typeof m.html !== 'string' || typeof m.text !== 'string')
      return json({ error: 'bad_request' }, 400)
    const headers = Object.fromEntries(Object.entries(m.headers ?? {}).filter(([k, v]) => HEADERS.has(k) && typeof v === 'string')) as Record<string, string>

    try {
      const r = await env.EMAIL.send({
        to: m.to,
        from: FROM,
        ...(env.REPLY_TO ? { replyTo: env.REPLY_TO } : {}),
        subject: m.subject.slice(0, 200),
        html: m.html,
        text: m.text,
        headers,
      })
      return json({ ok: true, id: r.messageId })
    } catch (e) {
      return json({ error: (e as { code?: string }).code ?? String(e) }, 502)
    }
  },
}
