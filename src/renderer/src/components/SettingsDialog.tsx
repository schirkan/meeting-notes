import { useEffect, useRef } from 'react'

type SettingsDialogProps = {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

export function SettingsDialog(props: SettingsDialogProps) {
  const { isOpen, onClose, children } = props
  const dialogRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)

      if (focusables.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (event.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)

    // Initialer Fokus auf den Schließen-Button oder ersten Input
    const focusTarget = dialogRef.current?.querySelector<HTMLElement>(
      '.settings-dialog-close, ' + FOCUSABLE_SELECTOR
    )
    focusTarget?.focus()

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  return (
    <div className="settings-dialog-overlay" role="presentation" onClick={onClose}>
      <section
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-dialog-header">
          <h2 id="settings-dialog-title">Einstellungen</h2>
          <button className="settings-dialog-close" type="button" onClick={onClose} aria-label="Dialog schließen">
            ×
          </button>
        </div>

        <div className="settings-dialog-grid">
          {children}
        </div>
      </section>
    </div>
  )
}