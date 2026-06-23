import type { DebugLogEntry } from '@shared/transcript-contract'

type DebugLogPanelProps = {
  debugOpen: boolean
  debugLog: DebugLogEntry[]
  setDebugOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export function DebugLogPanel(props: DebugLogPanelProps) {
  const { debugOpen, debugLog, setDebugOpen } = props

  return (
    <section className={`debug-log-dock ${debugOpen ? 'open' : 'closed'}`}>
      <button
        className={`debug-log-toggle ${debugOpen ? 'panel-toggle' : ''}`.trim()}
        type="button"
        onClick={() => setDebugOpen((prev) => !prev)}
        aria-expanded={debugOpen}
        aria-label={debugOpen ? 'Debug-Log schließen' : 'Debug-Log öffnen'}
      >
        {debugOpen ? (
          <>
            <h2>Debug-Log</h2>
            <span className="toggle-indicator">−</span>
          </>
        ) : (
          <span className="debug-log-bug-icon" aria-hidden="true">🐞</span>
        )}
      </button>

      {debugOpen && (
        <div className="panel debug-log-panel">
          {debugLog.length === 0 ? (
            <p className="empty">Noch keine Debug-Einträge.</p>
          ) : (
            <div className="debug-log-table-wrap">
              <table className="debug-log-table">
                <thead>
                  <tr>
                    <th scope="col">Zeit</th>
                    <th scope="col">Quelle</th>
                    <th scope="col">Level</th>
                    <th scope="col">Nachricht</th>
                  </tr>
                </thead>
                <tbody>
                  {debugLog.map((entry) => (
                    <tr key={entry.id} className={`debug-log-entry ${entry.level}`}>
                      <td className="debug-log-time">{new Date(entry.timestampIso).toLocaleString('de-DE')}</td>
                      <td className="debug-log-source">{entry.source.toUpperCase()}</td>
                      <td className="debug-log-level">{entry.level}</td>
                      <td className="debug-log-message">{entry.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}