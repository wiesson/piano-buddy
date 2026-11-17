import type { CapacitorConfig } from '@capacitor/cli'

// Die iOS-App ist eine dünne Hülle: Sie lädt die deployte Web-App (Updates ohne Neuinstallation)
// und liefert, was Safari nicht kann: MIDI vom Klavier über CoreMIDI (Plugin PianoMidi).
// Für die Entwicklung: CAP_SERVER_URL=https://<LAN-IP>:5199 npx cap sync ios
const config: CapacitorConfig = {
  appId: 'me.wiese.pianobuddy',
  appName: 'Piano Buddy',
  webDir: 'dist',
  server: {
    url: process.env.CAP_SERVER_URL ?? 'https://pianobuddy.fyi',
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#241a17',
  },
}

export default config
