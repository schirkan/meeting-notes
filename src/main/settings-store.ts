import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  DEFAULT_USER_SETTINGS,
  type FixedAzureConfigState,
  normalizeUserSettings,
  type FixedAzureConfig,
  type UserSettings,
  validateFixedAzureConfig
} from '@shared/config-contract'

const CONFIG_DIR = join(process.cwd(), 'config')
const AZURE_FIXED_PATH = join(CONFIG_DIR, 'azure.json')
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

export async function loadFixedAzureConfig(): Promise<FixedAzureConfig | null> {
  try {
    const raw = await readFile(AZURE_FIXED_PATH, 'utf8')
    const parsed = JSON.parse(raw) as unknown

    if (validateFixedAzureConfig(parsed)) {
      return parsed
    }

    const legacy = parsed as { azure?: unknown }
    if (legacy && validateFixedAzureConfig(legacy.azure)) {
      return legacy.azure
    }

    return null
  } catch {
    return null
  }
}

function normalizeFixedAzureConfig(config: FixedAzureConfig): FixedAzureConfig {
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

export async function saveFixedAzureConfig(config: FixedAzureConfig): Promise<FixedAzureConfig> {
  const normalized = normalizeFixedAzureConfig(config)

  if (!validateFixedAzureConfig(normalized)) {
    throw new Error('Azure Fixed Config ungültig. Bitte Endpoint, Region, Speech Key und Proxy-Felder prüfen.')
  }

  await mkdir(dirname(AZURE_FIXED_PATH), { recursive: true })
  await writeFile(AZURE_FIXED_PATH, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  return normalized
}

export async function getFixedAzureConfigState(): Promise<FixedAzureConfigState> {
  const config = await loadFixedAzureConfig()

  return {
    exists: config !== null,
    path: AZURE_FIXED_PATH,
    config
  }
}

export function getConfigPaths(): { azure: string; user: string } {
  return {
    azure: AZURE_FIXED_PATH,
    user: USER_SETTINGS_PATH
  }
}
