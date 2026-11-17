import type { Plugin } from 'vite'
import { FAQ, SITE } from '../src/content/site'
import { LESSONS } from '../src/music/lessons'

/**
 * Die App ist eine reine SPA: Ohne JavaScript ist #root leer. Google rendert JavaScript, die
 * meisten KI-Crawler (GPTBot, ClaudeBot, PerplexityBot) nicht. Darum schreibt dieses Plugin
 * dieselben Inhalte, die die Startseite zeigt, als statisches HTML in index.html, dazu JSON-LD
 * und /llms.txt. Quelle ist src/content/site.ts, damit nichts auseinanderläuft.
 *
 * Das statische HTML liegt in #root und verschwindet, sobald React rendert. Für Menschen bleibt
 * es unsichtbar, solange die App normal lädt (erst nach 2 s ohne App wird es sichtbar).
 */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const en = <T extends { en: string }>(x: T) => x.en

function jsonLd() {
  const author = { '@type': 'Person', '@id': `${SITE.author.url}#person`, name: SITE.author.name, url: SITE.author.url }
  const graph = [
    {
      '@type': 'WebApplication',
      '@id': `${SITE.url}#app`,
      name: SITE.name,
      url: SITE.url,
      description: en(SITE.tagline),
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'iOS, iPadOS, macOS, Windows, Android (browser)',
      browserRequirements: 'A current browser. MIDI needs Chrome or Edge; Safari uses the microphone.',
      inLanguage: ['en', 'de'],
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      license: 'https://opensource.org/licenses/MIT',
      codeRepository: SITE.source,
      image: `${SITE.url}og-home.jpg`,
      author,
      publisher: { '@type': 'Organization', name: SITE.studio.name, url: SITE.studio.url },
      featureList: [
        'Each piece in three stages: left hand, right hand, both hands',
        'Wait mode: the music waits for the right key',
        'Falling notes with note names and fingering',
        'Listens through the microphone or over MIDI',
        'A stage counts as learned after three clean passes',
        'Progress syncs across devices without an account',
        'Works offline as a PWA',
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': `${SITE.url}#faq`,
      mainEntity: FAQ.map((f) => ({
        '@type': 'Question',
        name: f.q.en,
        acceptedAnswer: { '@type': 'Answer', text: f.a.en },
      })),
    },
  ]
  // </script> im Text darf das Skript nicht beenden
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')
  return `<script type="application/ld+json">${json}</script>`
}

function staticBody() {
  const lessons = LESSONS.map((l) => `<li><strong>${esc(l.title.en)}</strong>: ${esc(l.goal.en)}</li>`).join('')
  const faq = FAQ.map((f) => `<h3>${esc(f.q.en)}</h3><p>${esc(f.a.en)}</p>`).join('')
  return `<div class="prerender">
<h1>${esc(SITE.title.en)}</h1>
<p>${esc(SITE.tagline.en)}</p>
<h2>Learning path</h2>
<ol>${lessons}</ol>
<h2>Questions and answers</h2>
${faq}
<footer>
<p>Built by <a href="${SITE.author.url}">${SITE.author.name}</a>, <a href="${SITE.studio.url}">${SITE.studio.name}</a>.
<a href="${SITE.source}">Source on GitHub</a> (MIT). <a href="${SITE.imprint}">Site notice</a> · <a href="${SITE.privacy}">Privacy</a> · <a href="/llms.txt">llms.txt</a></p>
</footer>
</div>`
}

function llmsTxt() {
  const lessons = LESSONS.map((l) => `- ${l.title.en}: ${l.goal.en}`).join('\n')
  const faq = FAQ.map((f) => `### ${f.q.en}\n\n${f.a.en}`).join('\n\n')
  return `# ${SITE.name}

> ${SITE.tagline.en}

Key facts:

- Web app (PWA) at ${SITE.url}, in English and German. Runs in Safari on iPhone and iPad and in any current browser on Mac and PC; add to home screen for offline use.
- Method: every piece in three stages, left hand, right hand, then both. Wait mode: the music waits for the right key. Falling notes with note names and fingering, both can be hidden.
- Progress metric: clean passes, not minutes. A stage is learned after three clean passes (based on Duke, Simmons & Cash 2009: the share of correct attempts predicted next-day performance, practice time did not).
- Input: microphone (any piano, expected-note detection with overtone checks), MIDI over USB or Bluetooth in Chrome/Edge, computer keyboard by finger (left A S D F G, right H J K L ;), or on-screen keys.
- Known limit: with the microphone, notes an octave above the left hand cannot be verified; the app marks them as unverified. MIDI is exact.
- Free, no account, no ads, no subscription. Open source under the MIT license: ${SITE.source}
- Sync without accounts: per-device secret key, further devices pair with an 8-character code. Stored: passes only (piece, stage, clean, wrong notes, duration). No audio is recorded or uploaded.
- Not yet available: importing your own MIDI files (planned next), an iOS app with Bluetooth MIDI (in development), a tempo mode with metronome (planned).
- Built by ${SITE.author.name} (${SITE.author.url}), ${SITE.studio.name} (${SITE.studio.url}), Germany.

## Learning path

${lessons}

## Questions and answers

${faq}

## Links

- [App](${SITE.url})
- [Source code](${SITE.source})
- [Report a bug or request a feature](${SITE.issues})
- [Site notice](${SITE.imprint})
- [Privacy](${SITE.privacy})
`
}

export function seo(): Plugin {
  return {
    name: 'piano-buddy-seo',
    transformIndexHtml(html) {
      return html.replace('<!--seo:head-->', jsonLd()).replace('<!--seo:body-->', staticBody())
    },
    configureServer(server) {
      server.middlewares.use('/llms.txt', (_req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(llmsTxt())
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'llms.txt', source: llmsTxt() })
    },
  }
}
