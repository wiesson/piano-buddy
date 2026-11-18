import type { CapacitorConfig } from '@capacitor/cli'

// Die iOS-App bündelt die App (pnpm build:ios → dist-ios) statt die Website zu laden: offline
// vom ersten Start an, und Apple lehnt reine Web-Hüllen ab (Richtlinie 4.2). Dazu liefert sie,
// was Safari nicht kann: MIDI vom Klavier über CoreMIDI (Plugin PianoMidi).
// Entwicklung gegen den Dev-Server: CAP_SERVER_URL=https://<LAN-IP>:5198/app/ npx cap sync ios
const config: CapacitorConfig = {
  appId: 'me.wiese.pianobuddy',
  appName: 'Piano Buddy',
  webDir: 'dist-ios',
  ...(process.env.CAP_SERVER_URL ? { server: { url: process.env.CAP_SERVER_URL } } : {}),
  ios: {
    contentInset: 'never',
    backgroundColor: '#241a17',
  },
}

export default config
