import type { AzureConfigState } from '@shared/config-contract'
import type { ConfigDraft } from '../config-utils'

type ConfigPanelProps = {
  configState: AzureConfigState | null
  configDraft: ConfigDraft
  statusRunning: boolean
  setConfigDraft: React.Dispatch<React.SetStateAction<ConfigDraft>>
  onSaveConfig: () => Promise<void>
}

export function ConfigPanel(props: ConfigPanelProps) {
  const {
    configState,
    configDraft,
    statusRunning,
    setConfigDraft,
    onSaveConfig
  } = props

  return (
    <section className="panel settings">
      <div className="panel-header">
        <h2>Azure-Konfiguration</h2>
      </div>

      {!configState?.exists && (
        <div className="settings-inline-hint">
          Keine gültige <code>config/azure.json</code> gefunden. Bitte jetzt anlegen.
        </div>
      )}

      <div className="settings-block">
        <label>
          Endpoint
          <input
            type="text"
            value={configDraft.endpoint}
            onChange={(event) => setConfigDraft((prev) => ({ ...prev, endpoint: event.target.value }))}
            placeholder="https://..."
            disabled={statusRunning}
          />
        </label>

        <label>
          Region
          <input
            type="text"
            value={configDraft.region}
            onChange={(event) => setConfigDraft((prev) => ({ ...prev, region: event.target.value }))}
            placeholder="westeurope"
            disabled={statusRunning}
          />
        </label>

        <label>
          Speech Key
          <input
            type="password"
            value={configDraft.speechKey}
            onChange={(event) => setConfigDraft((prev) => ({ ...prev, speechKey: event.target.value }))}
            placeholder="Azure Speech Key"
            disabled={statusRunning}
          />
        </label>

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={configDraft.interimResults}
            onChange={(event) => setConfigDraft((prev) => ({ ...prev, interimResults: event.target.checked }))}
            disabled={statusRunning}
          />
          <span>Interim Results aktivieren</span>
        </label>

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={configDraft.useProxy}
            onChange={(event) => setConfigDraft((prev) => ({ ...prev, useProxy: event.target.checked }))}
            disabled={statusRunning}
          />
          <span>Proxy verwenden</span>
        </label>

        <label>
          Proxy Host
          <input
            type="text"
            value={configDraft.proxyHost}
            onChange={(event) => setConfigDraft((prev) => ({ ...prev, proxyHost: event.target.value }))}
            disabled={statusRunning || !configDraft.useProxy}
          />
        </label>

        <label>
          Proxy Port
          <input
            type="number"
            min={1}
            value={configDraft.proxyPort}
            onChange={(event) => setConfigDraft((prev) => ({ ...prev, proxyPort: event.target.value }))}
            disabled={statusRunning || !configDraft.useProxy}
          />
        </label>

        <label>
          Proxy Benutzername (optional)
          <input
            type="text"
            value={configDraft.proxyUsername}
            onChange={(event) => setConfigDraft((prev) => ({ ...prev, proxyUsername: event.target.value }))}
            disabled={statusRunning || !configDraft.useProxy}
          />
        </label>

        <label>
          Proxy Passwort (optional)
          <input
            type="password"
            value={configDraft.proxyPassword}
            onChange={(event) => setConfigDraft((prev) => ({ ...prev, proxyPassword: event.target.value }))}
            disabled={statusRunning || !configDraft.useProxy}
          />
        </label>
      </div>

      <button className="primary-button settings-save-button" type="button" onClick={() => void onSaveConfig()} disabled={statusRunning}>
        Azure-Konfiguration speichern
      </button>

      {configState?.path && <p className="meta-path">Pfad: {configState.path}</p>}
    </section>
  )
}