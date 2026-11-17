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
      manifest: {
        name: 'Piano Buddy',
        short_name: 'Piano',
        lang: 'de',
        display: 'fullscreen',
        orientation: 'any',
        background_color: '#241a17',
        theme_color: '#241a17',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
  server: { host: true },
})
