import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite-plus'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Die App läuft im Web unter pianobuddy.fyi/app (eigener Worker auf der Route /app*, gleiche
 * Domain wie die Website: Fortschritt und Geräteschlüssel im Browser bleiben erhalten) und
 * gebündelt in der iOS-App (CAP=1: Basis /, ohne Service Worker, Ausgabe dist-ios).
 */
const cap = process.env.CAP === '1'
// HTTPS ist Pflicht, sobald iPhone/iPad übers WLAN zugreifen: Safari gibt das Mikrofon nur in
// einem sicheren Kontext frei. Lokal am Mac reicht http://localhost.
const lan = process.env.LAN === '1'
const base = cap ? '/' : '/app/'
const pkg = (p: string) => fileURLToPath(new URL(`../../packages/${p}/src`, import.meta.url))
// Version für Meldungen aus der Debug-Ebene: Paketversion und Commit
const version = (() => {
  const v = (JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }).version
  try {
    return `${v}+${execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()}`
  } catch {
    return v
  }
})()

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(version) },
  // .env.local (VITE_CONVEX_URL) liegt im Wurzelverzeichnis des Repos
  envDir: '../..',
  resolve: { alias: { '@piano/core': pkg('core'), '@piano/ui': pkg('ui') } },
  // Der Worker sucht Dateien unter dem Anfragepfad: /app/assets/… liegt in dist/app/assets/…
  build: { outDir: cap ? 'dist-ios' : 'dist/app', emptyOutDir: true },
  plugins: [
    // Dateibasierte Routen in src/routes; Seiten als eigene Chunks
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    lan && basicSsl(),
    !cap &&
      VitePWA({
        registerType: 'autoUpdate',
        scope: base,
        base,
        workbox: {
          globPatterns: ['**/*.{js,css,html,woff2,png,svg,jpg}'],
          navigateFallback: `${base}index.html`,
          // Die Notenansicht (VexFlow mit Notenschrift, ~390 kB) nicht jedem vorab laden: erst beim
          // ersten Umschalten holen, dann für offline zwischenspeichern
          globIgnores: ['**/SheetView-*.js'],
          runtimeCaching: [
            { urlPattern: /\/assets\/SheetView-.*\.js$/, handler: 'CacheFirst', options: { cacheName: 'sheet-view' } },
          ],
        },
        manifest: {
          name: 'Piano Buddy',
          short_name: 'Piano',
          lang: 'de',
          scope: base,
          start_url: base,
          display: 'fullscreen',
          orientation: 'any',
          background_color: '#fbf7ef',
          theme_color: '#fbf7ef',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
            { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
          ],
        },
      }),
    // Fallback des Workers: unbekannte Pfade unter /app liefern dist/index.html (eine Kopie)
    !cap && {
      name: 'piano-app-fallback',
      apply: 'build' as const,
      closeBundle: async () => {
        const { copyFile } = await import('node:fs/promises')
        await copyFile('dist/app/index.html', 'dist/index.html')
      },
    },
  ],
  server: { host: true },
})
