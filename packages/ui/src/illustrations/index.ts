/**
 * Gouache-Illustrationen als Vite-Importe: Jede App bündelt sie mit (die iOS-App hat keine
 * Website im Rücken). Lektionsdaten nennen den Pfad „/illustrations/ode.jpg“; hier wird daraus
 * die gebündelte Adresse.
 */
const files = import.meta.glob('./*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

export function illustration(path: string | undefined): string | undefined {
  if (!path) return undefined
  return files[`./${path.split('/').pop()}`]
}
