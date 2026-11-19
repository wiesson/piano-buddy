import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite-plus'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { seo } from './scripts/seo'

/**
 * Die Website pianobuddy.fyi (Worker „piano-buddy“ mit Custom Domain). Die App liegt unter /app
 * in einem eigenen Worker; lokal reicht der Dev-Server /app an den App-Server (Port 5198) durch,
 * damit beides wie in Produktion unter einer Adresse läuft.
 */
const lan = process.env.LAN === '1'
const pkg = (p: string) => fileURLToPath(new URL(`../../packages/${p}/src`, import.meta.url))

export default defineConfig({
  // .env.local (VITE_CONVEX_URL) liegt im Wurzelverzeichnis des Repos
  envDir: '../..',
  resolve: { alias: { '@piano/core': pkg('core'), '@piano/ui': pkg('ui') } },
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), seo(), lan && basicSsl()],
  server: {
    host: true,
    proxy: { '/app': { target: `${lan ? 'https' : 'http'}://localhost:5198`, ws: true, secure: false } },
  },
})
