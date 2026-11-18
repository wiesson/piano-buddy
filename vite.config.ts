import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'
import { seo } from './scripts/seo'

// HTTPS ist Pflicht, sobald iPhone/iPad übers WLAN zugreifen: Safari gibt das Mikrofon nur in
// einem sicheren Kontext frei. Lokal am Mac reicht http://localhost.
const lan = process.env.LAN === '1'

export default defineConfig({
  plugins: [
    // Dateibasierte Routen in src/routes; erzeugt src/routeTree.gen.ts, Seiten als eigene Chunks
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    seo(),
    lan && basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      // Schriften und Icons gehören zur App und müssen offline da sein
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,jpg}'],
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
        display: 'fullscreen',
        orientation: 'any',
        background_color: '#fbf7ef',
        theme_color: '#fbf7ef',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
  server: { host: true },
})
