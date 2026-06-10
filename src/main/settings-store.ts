import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  DEFAULT_USER_SETTINGS,
  normalizeUserSettings,
  type FixedAzureConfig,
  type UserSettings,
  validateFixedAzureConfig
} from '@shared/config-contract'

const CONFIG_DIR = join(process.cwd(), 'config')
const AZURE_FIXED_PATH = join(CONFIG_DIR, 'azure.fixed.json')
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

export function getConfigPaths(): { azure: string; user: string } {
  return {
    azure: AZURE_FIXED_PATH,
    user: USER_SETTINGS_PATH
  }
}
