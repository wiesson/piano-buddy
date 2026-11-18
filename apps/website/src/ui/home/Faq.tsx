import { FAQ } from '@piano/core/content/site'
import { localized, t } from '@piano/core/i18n'

/** Häufige Fragen: native <details>, ohne JavaScript bedienbar, eine Frage pro Zeile */
export function Faq() {
  return (
    <section className="faq" id="faq" aria-labelledby="faq-title">
      <h2 id="faq-title">{t.site.faqTitle}</h2>
      <div className="faq-list">
        {FAQ.map((item) => (
          <details key={item.id} id={`faq-${item.id}`}>
            <summary>
              <span>{localized(item.q)}</span>
              <svg className="faq-chevron" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M3 5.25 7 9.25l4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <p>{localized(item.a)}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
