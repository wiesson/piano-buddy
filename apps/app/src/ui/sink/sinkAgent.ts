import { createAgent } from '@ui-sdk/react/agent'

export type Agent = ReturnType<typeof createAgent>
export type ObservedChange = Parameters<Parameters<Agent['subscribe']>[0]>[0]

let bridge: Agent | null = null

/**
 * Agenten-Brücke für die Bausteine-Seite, auch im fertigen Build. In der Entwicklung gibt es sie
 * schon global (window.pianoAgent, diagnostics/agent.ts): dieselbe nehmen, nie zwei anlegen.
 */
export async function sinkAgent(): Promise<Agent> {
  if (import.meta.env.DEV) {
    await import('../../diagnostics/agent')
    if (window.pianoAgent) return window.pianoAgent
  }
  bridge ??= createAgent()
  return bridge
}
