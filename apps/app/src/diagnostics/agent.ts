import { createAgent } from '@ui-sdk/react/agent'

/**
 * Agenten-Brücke des UI SDK, nur in der Entwicklung: Tests und Erkundungs-Agenten lesen über
 * `window.pianoAgent.snapshot()` alle Bausteine mit Zustand und Aktionen, steuern sie mit
 * `act({ steps })` und finden in `changes` jede Änderung mit Grund und Quelle (Mensch oder Agent).
 * Die Interaktions-Karte ist der Maßstab, gegen den das geprüft wird.
 */
const agent = createAgent()
const changes: unknown[] = []
agent.subscribe((c) => {
  changes.push(c)
  if (changes.length > 500) changes.shift()
})

declare global {
  interface Window {
    pianoAgent?: typeof agent & { changes: unknown[] }
  }
}
window.pianoAgent = Object.assign(agent, { changes })
