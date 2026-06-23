import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  DEFAULT_USER_SETTINGS,
  type AzureConfigState,
  normalizeUserSettings,
  type AzureConfig,
  type UserSettings,
  validateAzureConfig
} from '@shared/config-contract'

const CONFIG_DIR = join(process.cwd(), 'config')
const AZURE_CONFIG_PATH = join(CONFIG_DIR, 'azure.json')
const USER_SETTINGS_PATH = join(CONFIG_DIR, 'user-settings.json')

export async function loadUserSettings(): Promise<UserSettings> {
  try {
    const raw = await readFile(USER_SETTINGS_PATH, 'utf8')
    const parsed = JSON.parse(raw) as Partial<UserSettings>
    return normalizeUserSettings(parsed)
  } catch {
    return DEFAULT_USER_SETTINGS
  }
}

export async function saveUserSettings(settings: UserSettings): Promise<UserSettings> {
  const normalized = normalizeUserSettings(settings)
  await mkdir(dirname(USER_SETTINGS_PATH), { recursive: true })
  await writeFile(USER_SETTINGS_PATH, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  return normalized
}

export async function loadAzureConfig(): Promise<AzureConfig | null> {
  try {
    const raw = await readFile(AZURE_CONFIG_PATH, 'utf8')
    const parsed = JSON.parse(raw) as unknown

    if (validateAzureConfig(parsed)) {
      return parsed
    }

    const legacy = parsed as { azure?: unknown }
    if (legacy && validateAzureConfig(legacy.azure)) {
      return legacy.azure
    }

    return null
  } catch {
    return null
  }
}

function normalizeAzureConfig(config: AzureConfig): AzureConfig {
  const proxy = config.proxy

  return {
    endpoint: config.endpoint.trim(),
    region: config.region.trim(),
    speechKey: config.speechKey.trim(),
    interimResults: config.interimResults,
    proxy: proxy && proxy.host.trim().length > 0
      ? {
        host: proxy.host.trim(),
        port: proxy.port,
        username: proxy.username?.trim() || undefined,
        password: proxy.password?.trim() || undefined
      }
      : undefined
  }
}

export async function saveAzureConfig(config: AzureConfig): Promise<AzureConfig> {
  const normalized = normalizeAzureConfig(config)

  if (!validateAzureConfig(normalized)) {
    throw new Error('Azure-Konfiguration ungültig. Bitte Endpoint, Region, Speech Key und Proxy-Felder prüfen.')
  }

  await mkdir(dirname(AZURE_CONFIG_PATH), { recursive: true })
  await writeFile(AZURE_CONFIG_PATH, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  return normalized
}

export async function getAzureConfigState(): Promise<AzureConfigState> {
  const config = await loadAzureConfig()

  return {
    exists: config !== null,
    path: AZURE_CONFIG_PATH,
    config
  }
}

export function getConfigPaths(): { azure: string; user: string } {
  return {
    azure: AZURE_CONFIG_PATH,
    user: USER_SETTINGS_PATH
  }
}
