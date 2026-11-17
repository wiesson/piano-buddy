import { defineConfig } from 'vitest/config'

// Getrennt von vite.config.ts, damit Tests ohne PWA- und SSL-Plugins laufen.
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'app', include: ['src/**/*.test.ts'], environment: 'node' } },
      {
        // Convex-Funktionen gegen ein Backend im Speicher (convex-test)
        test: {
          name: 'convex',
          include: ['convex/**/*.test.ts'],
          environment: 'edge-runtime',
          server: { deps: { inline: ['convex-test'] } },
        },
      },
    ],
  },
})
