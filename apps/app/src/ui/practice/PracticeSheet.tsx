import { useEffect, useState, type ReactNode } from 'react'
import {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from '@ui-sdk/react/drawer'
import { Popover, PopoverContent, PopoverTrigger } from '@ui-sdk/react/popover'
import { t } from '@piano/core/i18n'
import { usePrefersLight } from '@piano/ui/shared/usePrefersLight'

/** Am Telefon ein Sheet, sonst ein Popover */
const PHONE = '(max-width: 699px)'

function usePhone() {
  const [phone, setPhone] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(PHONE).matches)
  useEffect(() => {
    const mq = matchMedia(PHONE)
    const on = () => setPhone(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return phone
}

/**
 * Einstellungen und Stufen der Übe-Seite. Am Telefon ein Sheet wie bei iOS, genau so hoch wie
 * sein Inhalt (höchstens fast der ganze Bildschirm): ein einziger Rastpunkt, also zieht ein Wisch
 * nie das Blatt auf, statt zu scrollen. Die Übe-Ansicht darüber bleibt sichtbar und bedienbar
 * (keine Abdunklung). Am Desktop ein Popover am Knopf.
 *
 * HIG: Sheets für abgegrenzte, seltene Aufgaben (Einstellungen, Stufe wählen). Was man oft hin
 * und her schaltet (Tempo) und das Ergebnis bleiben auf der Seite.
 */
export function PracticeSheet({
  title,
  trigger,
  triggerClassName,
  triggerLabel,
  children,
  open,
  onOpenChange,
}: {
  title: string
  trigger: ReactNode
  triggerClassName?: string
  triggerLabel?: string
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const phone = usePhone()
  // Das Sheet liegt im body, außerhalb von .practice: Papier-Farben selbst mitbringen
  const paper = usePrefersLight()
  if (!phone) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger className={triggerClassName} aria-label={triggerLabel}>
          {trigger}
        </PopoverTrigger>
        <PopoverContent className="popover more-menu" side="bottom" align="end" sideOffset={6}>
          {children}
        </PopoverContent>
      </Popover>
    )
  }
  return (
    // Ins body, nicht in die Kopfzeile: Sonst erbt das Sheet Überschrift und Serifenschrift
    <Drawer
      snapPoints={['content']}
      modalAbove="content"
      open={open}
      onOpenChange={onOpenChange}
      container={typeof document === 'undefined' ? null : document.body}
    >
      <DrawerTrigger className={triggerClassName} aria-label={triggerLabel}>
        {trigger}
      </DrawerTrigger>
      <DrawerBackdrop className="sheet-backdrop" />
      <DrawerContent className={`sheet${paper ? ' paper' : ''}`}>
        {/* Ein Rastpunkt: Griff nur als Zeichen, kein Knopf (Ziehen nach unten schließt) */}
        <span className="sheet-handle" aria-hidden="true" />
        <div className="sheet-head">
          <DrawerTitle className="sheet-title">{title}</DrawerTitle>
          <DrawerClose className="icon-button sheet-close" aria-label={t.settings.close}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </DrawerClose>
        </div>
        <div className="sheet-body">{children}</div>
      </DrawerContent>
    </Drawer>
  )
}
