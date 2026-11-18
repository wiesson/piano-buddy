import { fileURLToPath } from 'node:url'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Storybooks Vite: nur, was ein Baustein zum Zeichnen braucht
const pkg = (p: string) => fileURLToPath(new URL(`../../${p}/src`, import.meta.url))

export default defineConfig({
  resolve: { alias: { '@piano/core': pkg('core'), '@piano/ui': pkg('ui') } },
  plugins: [viteReact()],
})
