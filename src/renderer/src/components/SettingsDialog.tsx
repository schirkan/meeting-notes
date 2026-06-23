type SettingsDialogProps = {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
}

export function SettingsDialog(props: SettingsDialogProps) {
  const { isOpen, onClose, children } = props

  if (!isOpen) {
    return null
  }

  return (
    <div className="settings-dialog-overlay" role="presentation" onClick={onClose}>
      <section
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