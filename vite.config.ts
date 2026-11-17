import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

// HTTPS ist Pflicht, sobald iPhone/iPad übers WLAN zugreifen: Safari gibt das Mikrofon nur in
// einem sicheren Kontext frei. Lokal am Mac reicht http://localhost.
const lan = process.env.LAN === '1'

export default defineConfig({
  plugins: [
    react(),
    lan && basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      // Schriften und Icons gehören zur App und müssen offline da sein
      workbox: { globPatterns: ['**/*.{js,css,html,woff2,png,svg}'] },
      manifest: {
        name: 'Piano Buddy',
        short_name: 'Piano',
        lang: 'de',
        display: 'fullscreen',
        orientation: 'any',
        background_color: '#241a17',
        theme_color: '#241a17',
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
