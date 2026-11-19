/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const setup = () => convexTest(schema, modules)
const rowOf = (t: ReturnType<typeof setup>, email: string) =>
  t.run((ctx) =>
    ctx.db
      .query('newsletter')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique(),
  )

describe('Launch-Liste mit Double-Opt-in', () => {
  it('meldet erst an, wenn der Link aus der Bestätigungsmail geklickt wurde', async () => {
    const t = setup()
    await t.mutation(api.newsletter.subscribe, { email: ' Anna@Example.org ', topics: ['launch'], locale: 'de' })
    expect(await t.query(internal.newsletter.recipients, { topic: 'launch' })).toEqual([])

    const row = (await rowOf(t, 'anna@example.org'))!
    expect(await t.mutation(api.newsletter.confirm, { token: row.confirmToken })).toEqual({ ok: true, topics: ['launch'] })
    expect((await t.query(internal.newsletter.recipients, { topic: 'launch' })).map((r) => r.email)).toEqual(['anna@example.org'])
    // Nur das gewählte Thema
    expect(await t.query(internal.newsletter.recipients, { topic: 'updates' })).toEqual([])
  })

  it('nach dem Abmelden bekommt niemand mehr Mails; neu anmelden braucht eine neue Bestätigung', async () => {
    const t = setup()
    await t.mutation(api.newsletter.subscribe, { email: 'ben@example.org', topics: ['launch', 'updates'], locale: 'en' })
    const row = (await rowOf(t, 'ben@example.org'))!
    await t.mutation(api.newsletter.confirm, { token: row.confirmToken })
    expect(await t.mutation(api.newsletter.unsubscribe, { token: row.unsubToken })).toEqual({ ok: true })
    expect(await t.query(internal.newsletter.recipients, { topic: 'updates' })).toEqual([])

    await t.mutation(api.newsletter.subscribe, { email: 'ben@example.org', topics: ['updates'], locale: 'en' })
    expect(await t.query(internal.newsletter.recipients, { topic: 'updates' })).toEqual([])
    await t.mutation(api.newsletter.confirm, { token: row.confirmToken })
    expect((await t.query(internal.newsletter.recipients, { topic: 'updates' })).map((r) => r.email)).toEqual(['ben@example.org'])
    // Das abgemeldete Thema kommt nicht ungefragt zurück
    expect(await t.query(internal.newsletter.recipients, { topic: 'launch' })).toEqual([])
  })

  it('schickt einer Adresse höchstens alle zehn Minuten eine Bestätigungsmail', async () => {
    vi.useFakeTimers()
    const t = setup()
    const mails = async () => (await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect())).length
    await t.mutation(api.newsletter.subscribe, { email: 'cara@example.org', topics: ['launch'], locale: 'de' })
    await t.mutation(api.newsletter.subscribe, { email: 'cara@example.org', topics: ['launch'], locale: 'de' })
    await t.mutation(api.newsletter.subscribe, { email: 'cara@example.org', topics: ['updates'], locale: 'de' })
    expect(await mails()).toBe(1)
    vi.advanceTimersByTime(11 * 60 * 1000)
    await t.mutation(api.newsletter.subscribe, { email: 'cara@example.org', topics: ['launch'], locale: 'de' })
    expect(await mails()).toBe(2)
    vi.useRealTimers()
  })

  it('speichert nichts, wenn der Honigtopf gefüllt ist, und lehnt kaputte Adressen ab', async () => {
    const t = setup()
    await t.mutation(api.newsletter.subscribe, { email: 'bot@example.org', topics: ['launch'], locale: 'de', website: 'http://spam' })
    expect(await rowOf(t, 'bot@example.org')).toBeNull()
    await expect(t.mutation(api.newsletter.subscribe, { email: 'keine-adresse', topics: ['launch'], locale: 'de' })).rejects.toThrow()
    await expect(t.mutation(api.newsletter.confirm, { token: 'falsch' })).resolves.toEqual({ ok: false })
  })
})
