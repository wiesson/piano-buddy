import { v } from 'convex/values'
import { internalAction } from './_generated/server'

/**
 * Mails der Launch-Liste. Versand über Cloudflare Email Sending (CLOUDFLARE_ACCOUNT_ID +
 * CLOUDFLARE_EMAIL_TOKEN) oder Resend (RESEND_API_KEY); ohne beides wird nichts verschickt und
 * die Anmeldung bleibt offen, bis der Versand eingerichtet ist. Absender: FROM_EMAIL, Antworten:
 * REPLY_TO_EMAIL (optional). Nur fetch, läuft in der Convex-Laufzeit.
 */

/** Convex stellt Umgebungsvariablen über process.env bereit (ohne Node-Typen im Projekt) */
declare const process: { env: Record<string, string | undefined> }

type Mail = { to: string; subject: string; html: string; text: string; headers?: Record<string, string> }

const siteUrl = () => (process.env.SITE_URL || 'https://pianobuddy.fyi').replace(/\/$/, '')
const from = () => process.env.FROM_EMAIL || 'Piano Buddy <hallo@pianobuddy.fyi>'
const bare = (f: string) => f.match(/<([^>]+)>/)?.[1]?.trim() ?? f.trim()

function provider(): 'cloudflare' | 'resend' | null {
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_EMAIL_TOKEN) return 'cloudflare'
  if (process.env.RESEND_API_KEY) return 'resend'
  return null
}

async function send(mail: Mail) {
  const replyTo = process.env.REPLY_TO_EMAIL || undefined
  if (provider() === 'cloudflare') {
    const name = from().match(/^([^<]+)</)?.[1]?.trim()
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/email/sending/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CLOUDFLARE_EMAIL_TOKEN}` },
      body: JSON.stringify({
        from: name ? { address: bare(from()), name } : bare(from()),
        ...(replyTo ? { reply_to: replyTo } : {}),
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        ...(mail.headers ? { headers: mail.headers } : {}),
      }),
    })
    const json = (await res.json().catch(() => null)) as { success?: boolean; errors?: { code: number; message: string }[] } | null
    if (!res.ok || !json?.success) throw new Error(`Cloudflare ${res.status} ${json?.errors?.map((e) => e.message).join('; ') ?? ''}`)
    return
  }
  const res = await fetch(`${process.env.RESEND_BASE_URL || 'https://api.resend.com'}/emails`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: from(), ...(replyTo ? { reply_to: replyTo } : {}), ...mail }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status} ${await res.text()}`)
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const COPY = {
  de: {
    subject: 'Bitte bestätige deine Anmeldung bei Piano Buddy',
    title: 'Fast geschafft.',
    body: (what: string) => `Klick auf den Knopf, dann sagen wir dir Bescheid: ${what}. Selten, nur wenn es etwas zu sagen gibt.`,
    launch: 'wenn Piano Buddy im App Store und bei Google Play ist',
    updates: 'wenn es Neues in der App gibt',
    and: ' und ',
    button: 'Anmeldung bestätigen',
    ignore: 'Du hast dich nicht angemeldet? Dann ignorier diese Mail einfach, ohne Klick passiert nichts.',
    unsub: 'Abmelden',
  },
  en: {
    subject: 'Please confirm your Piano Buddy sign-up',
    title: 'Almost there.',
    body: (what: string) => `Press the button and we’ll let you know ${what}. Rarely, only when there’s something to say.`,
    launch: 'when Piano Buddy is on the App Store and Google Play',
    updates: 'when there’s something new in the app',
    and: ' and ',
    button: 'Confirm sign-up',
    ignore: 'Didn’t sign up? Just ignore this email; nothing happens without a click.',
    unsub: 'Unsubscribe',
  },
}

/** Bestätigungsmail (Double-Opt-in), im Papier der Website */
export function confirmationMail(a: { email: string; locale: 'de' | 'en'; topics: ('launch' | 'updates')[]; confirmToken: string; unsubToken: string }): Mail {
  const c = COPY[a.locale]
  const what = a.topics.map((x) => c[x]).join(c.and)
  const confirmUrl = `${siteUrl()}/newsletter/confirm?token=${encodeURIComponent(a.confirmToken)}`
  const unsubUrl = `${siteUrl()}/newsletter/unsubscribe?token=${encodeURIComponent(a.unsubToken)}`
  const html = `<!doctype html><html lang="${a.locale}"><body style="margin:0;padding:32px 16px;background:#f6eedf;color:#2b2420;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<div style="max-width:480px;margin:0 auto;background:#fffcf6;border-radius:18px;padding:28px">
<p style="margin:0 0 18px;font-weight:650;font-size:16px">Piano Buddy</p>
<h1 style="margin:0 0 12px;font-family:Georgia,serif;font-weight:400;font-size:28px;line-height:1.15">${esc(c.title)}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:1.55;color:#4d4239">${esc(c.body(what))}</p>
<a href="${esc(confirmUrl)}" style="display:inline-block;padding:13px 22px;border-radius:999px;background:#2b2420;color:#f6eedf;font-weight:600;font-size:15px;text-decoration:none">${esc(c.button)}</a>
<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#75675a">${esc(c.ignore)}</p>
</div>
<p style="max-width:480px;margin:16px auto 0;font-size:12px;color:#75675a;text-align:center"><a href="${esc(siteUrl())}" style="color:#75675a">pianobuddy.fyi</a> · <a href="${esc(unsubUrl)}" style="color:#75675a">${esc(c.unsub)}</a></p>
</body></html>`
  const text = `${c.title}\n\n${c.body(what)}\n\n${c.button}: ${confirmUrl}\n\n${c.ignore}\n\n${c.unsub}: ${unsubUrl}`
  return {
    to: a.email,
    subject: c.subject,
    html,
    text,
    // Ein-Klick-Abmeldung im Mailprogramm: POST an Convex (die Website liefert nur Seiten aus)
    headers: process.env.CONVEX_SITE_URL
      ? {
          'List-Unsubscribe': `<${process.env.CONVEX_SITE_URL}/newsletter/unsubscribe?token=${encodeURIComponent(a.unsubToken)}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        }
      : { 'List-Unsubscribe': `<${unsubUrl}>` },
  }
}

export const sendConfirmation = internalAction({
  args: {
    email: v.string(),
    locale: v.union(v.literal('de'), v.literal('en')),
    topics: v.array(v.union(v.literal('launch'), v.literal('updates'))),
    confirmToken: v.string(),
    unsubToken: v.string(),
  },
  handler: async (_ctx, args) => {
    if (!provider()) {
      console.warn('[newsletter] Kein Mailversand eingerichtet: Bestätigungsmail nicht verschickt')
      return
    }
    await send(confirmationMail(args))
  },
})
