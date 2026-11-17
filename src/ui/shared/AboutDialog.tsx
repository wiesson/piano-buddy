import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@ui-sdk/react/dialog'
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from '@ui-sdk/react/segmented-control'
import { locale, setLocale, t, type Locale } from '../../i18n'
import { CloseIcon, InfoIcon, Logo } from './icons'

const AUTHOR = { name: 'Arne Wiese', url: 'https://wiesson.dev' }
const SOURCE = 'https://github.com/wiesson/piano-buddy'

/**
 * Kleines Über-Fenster: wer es gebaut hat, Quellcode, Sprache.
 * Ohne `label` ein Icon-Knopf; mit `label` ein Eintrag mit Icon und Text (Leiste der Startseite).
 */
export function AboutDialog({ label, className }: { label?: string; className?: string }) {
  return (
    <Dialog>
      {label ? (
        <DialogTrigger className={className}>
          <InfoIcon />
          {label}
        </DialogTrigger>
      ) : (
        <DialogTrigger className={className ?? 'icon-button'} aria-label={t.about.open}>
          <InfoIcon />
        </DialogTrigger>
      )}
      <DialogBackdrop className="dialog-backdrop" />
      <DialogContent className="dialog about">
        <div className="about-head">
          <Logo size={40} />
          <DialogTitle className="dialog-title">{t.about.title}</DialogTitle>
        </div>
        <DialogDescription className="dialog-desc">{t.about.text}</DialogDescription>

        <p className="about-by">
          {t.about.by}{' '}
          <a href={AUTHOR.url} target="_blank" rel="noopener">
            {AUTHOR.name}
          </a>
        </p>
        <p className="about-links">
          <a href={SOURCE} target="_blank" rel="noopener">
            {t.about.source}
          </a>
        </p>

        <section className="pair">
          <h3>{t.about.language}</h3>
          <SegmentedControl
            className="lang"
            aria-label={t.about.language}
            value={locale}
            onValueChange={(v) => v && v !== locale && setLocale(v as Locale)}
          >
            <SegmentedControlIndicator className="lang-indicator" />
            <SegmentedControlItem value="de" className="lang-item">
              Deutsch
            </SegmentedControlItem>
            <SegmentedControlItem value="en" className="lang-item">
              English
            </SegmentedControlItem>
          </SegmentedControl>
        </section>

        <p className="about-credits">{t.about.credits}</p>

        <DialogClose className="icon-button icon-button-ink dialog-close" aria-label={t.sync.close}>
          <CloseIcon />
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}
