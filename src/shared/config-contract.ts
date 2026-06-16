export interface FixedAzureConfig {
  endpoint: string
  region: string
  speechKey: string
  recognitionMode: 'conversationTranscriber' | 'speechRecognizer'
  interimResults: boolean
}

export interface UserSettings {
  language: string
  devices: {
    micId: string | null
    speakerLoopbackId: string | null
  }
}

export interface ResolvedAppConfig {
  azure: FixedAzureConfig
  user: UserSettings
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  language: 'de-DE',
  devices: {
    micId: null,
    speakerLoopbackId: null
  }
}

const BCP47_PATTERN = /^[a-z]{2,3}-[A-Z]{2}$/

export function normalizeUserSettings(input: Partial<UserSettings> | null | undefined): UserSettings {
  const language = input?.language?.trim()
  const safeLanguage = language && BCP47_PATTERN.test(language) ? language : DEFAULT_USER_SETTINGS.language

  return {
    language: safeLanguage,
    devices: {
      micId: input?.devices?.micId ?? DEFAULT_USER_SETTINGS.devices.micId,
      speakerLoopbackId: input?.devices?.speakerLoopbackId ?? DEFAULT_USER_SETTINGS.devices.speakerLoopbackId
    }
  }
}

export function validateFixedAzureConfig(input: unknown): input is FixedAzureConfig {
  if (!input || typeof input !== 'object') return false
  const candidate = input as Partial<FixedAzureConfig>

  const hasRequiredStrings =
    typeof candidate.endpoint === 'string' && candidate.endpoint.length > 0 &&
    typeof candidate.region === 'string' && candidate.region.length > 0 &&
    typeof candidate.speechKey === 'string' && candidate.speechKey.length > 0

  const hasSupportedMode =
    candidate.recognitionMode === 'conversationTranscriber' ||
    candidate.recognitionMode === 'speechRecognizer'

  return hasRequiredStrings && hasSupportedMode && typeof candidate.interimResults === 'boolean'
}
