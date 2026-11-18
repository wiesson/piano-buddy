import type { StorybookConfig } from '@storybook/react-vite'

/**
 * Alles, was Piano Buddy an Bausteinen hat: gemeinsame (packages/ui), die Übe-Bausteine der App
 * (apps/app) und die Abschnitte der Website (apps/website). Eigene Vite-Config nur mit React,
 * nie die App-Configs (PWA, Router-Plugin, Basis /app).
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx', '../../../apps/app/src/**/*.stories.tsx', '../../../apps/website/src/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-mcp'],
  framework: {
    name: '@storybook/react-vite',
    options: { builder: { viteConfigPath: '.storybook/vite.config.ts' } },
  },
  features: {
    // Agenten lesen Bausteine, Props und Stories über den MCP-Server (/mcp)
    componentsManifest: true,
    // experimentalReactComponentMeta findet unter TypeScript 7 keine Props (Hinweis beim Build):
    // dort die Standard-Erkennung (wie in tourvy)
  },
  typescript: { reactDocgen: 'react-docgen' },
  core: { disableTelemetry: true },
}

export default config
