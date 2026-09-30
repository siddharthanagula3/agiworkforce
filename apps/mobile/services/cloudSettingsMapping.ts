import type {
  Personalization,
  PersonalizationStyle,
  ThemeMode,
  AccentColor,
  FontPreference,
} from '@/stores/settingsStore';
import {
  useCloudSettingsStore,
  type CloudSettingsState,
} from '@/stores/settings/cloudSettingsStore';
import {
  PREFERRED_LENGTHS,
  RESPONSE_LANGUAGE_AUTO,
  TECHNICAL_LEVELS,
  type PreferredLength,
  type TechnicalLevel,
} from '@agiworkforce/types';
import { speechLanguageFromLegacy } from '@/src/features/voice/speechLanguage';

function isPreferredLength(value: unknown): value is PreferredLength {
  return (PREFERRED_LENGTHS as readonly unknown[]).includes(value);
}

function isTechnicalLevel(value: unknown): value is TechnicalLevel {
  return (TECHNICAL_LEVELS as readonly unknown[]).includes(value);
}

export interface CloudAppearance {
  theme?: ThemeMode;
  font?: FontPreference;
  accentColor?: AccentColor;
}

export interface CloudPersonalization {
  fullName?: string;
  nickname?: string;
  occupation?: string;
  customInstructions?: string;
  style?: PersonalizationStyle;
  warmth?: number;
  enthusiasm?: number;
  headersLists?: number;
  emoji?: number;
  preferredLength?: PreferredLength;
  technicalLevel?: TechnicalLevel;
  responseLanguage?: string;
}

export interface CloudGeneral {
  preferredName?: string;
  workDescription?: string;
  aboutYou?: string;
  instructions?: string;
}

export interface CloudNotifications {
  enabled?: boolean;
}

export interface CloudLanguage {
  locale?: string;
  speechLocale?: string;
  speechLanguage?: string;
}

export interface CloudChat {
  autoListen?: boolean;
}

export interface CloudCapabilities {
  memory?: boolean;
  searchPastChats?: boolean;
  generateFromHistory?: boolean;
}

export interface CloudSettings {
  appearance?: CloudAppearance;
  personalization?: CloudPersonalization;
  general?: CloudGeneral;
  notifications?: CloudNotifications;
  language?: CloudLanguage;
  capabilities?: CloudCapabilities;
  chat?: CloudChat;
  profile?: Record<string, unknown>;
  accessibility?: Record<string, unknown>;
  editor?: Record<string, unknown>;
}

/**
 * Project a snapshot of the cloud settings store into the cloud-safe namespace
 * shape. Returns the CloudSettings object that can be sent to POST /api/settings/sync.
 *
 * SECURITY: NEVER add secrets, device-specific fields, BYOK keys, or local model
 * paths here. Add only values whose meaning is identical across surfaces.
 *
 * @param store A CloudSettingsState snapshot (from useCloudSettingsStore.getState()).
 */
export function toCloudSettings(
  store: Pick<
    CloudSettingsState,
    | 'themeMode'
    | 'accentColor'
    | 'fontPreference'
    | 'personalization'
    | 'notificationsEnabled'
    | 'speechLanguage'
    | 'autoListenEnabled'
    | 'memoryEnabled'
    | 'referencePastChats'
    | 'generateMemoryFromHistory'
    | 'memoryPolicyInitialized'
  >,
): CloudSettings {
  const {
    themeMode,
    accentColor,
    fontPreference,
    personalization,
    notificationsEnabled,
    speechLanguage,
    autoListenEnabled,
    memoryEnabled,
    referencePastChats,
    generateMemoryFromHistory,
    memoryPolicyInitialized,
  } = store;

  const result: CloudSettings = {
    appearance: {
      theme: themeMode,
      font: fontPreference,
      accentColor,
    },
    personalization: {
      fullName: personalization.fullName,
      nickname: personalization.nickname,
      occupation: personalization.occupation,
      customInstructions: personalization.instructions,
      style: personalization.style,
      warmth: personalization.warmth,
      enthusiasm: personalization.enthusiasm,
      headersLists: personalization.headersLists,
      emoji: personalization.emoji,
      preferredLength: personalization.preferredLength ?? 'default',
      technicalLevel: personalization.technicalLevel ?? 'unspecified',
      responseLanguage: personalization.responseLanguage ?? RESPONSE_LANGUAGE_AUTO,
    },
    general: {
      preferredName: personalization.nickname,
      workDescription: personalization.occupation,
      aboutYou: personalization.aboutYou ?? '',
      instructions: personalization.instructions,
    },
    notifications: {
      enabled: notificationsEnabled,
    },
    language: {
      speechLanguage,
    },
    ...(memoryPolicyInitialized
      ? {
          capabilities: {
            memory: memoryEnabled,
            searchPastChats: referencePastChats,
            generateFromHistory: generateMemoryFromHistory,
          },
        }
      : {}),
    chat: {
      autoListen: autoListenEnabled,
    },
  };

  return result;
}

export function applyCloudSettings(partial: CloudSettings): void {
  const store = useCloudSettingsStore.getState();

  if (partial.appearance) {
    const { theme, font, accentColor } = partial.appearance;
    if (theme !== undefined) store.setThemeMode(theme);
    if (font !== undefined) store.setFontPreference(font);
    if (accentColor !== undefined) store.setAccentColor(accentColor);
  }

  if (partial.personalization) {
    const {
      fullName,
      nickname,
      occupation,
      customInstructions,
      style,
      warmth,
      enthusiasm,
      headersLists,
      emoji,
      preferredLength,
      technicalLevel,
      responseLanguage,
    } = partial.personalization;
    const patch: Partial<Personalization> = {};
    if (isPreferredLength(preferredLength)) patch.preferredLength = preferredLength;
    if (isTechnicalLevel(technicalLevel)) patch.technicalLevel = technicalLevel;
    if (typeof responseLanguage === 'string' && responseLanguage) {
      patch.responseLanguage = responseLanguage;
    }
    if (fullName !== undefined) patch.fullName = fullName;
    if (nickname !== undefined) patch.nickname = nickname;
    if (occupation !== undefined) patch.occupation = occupation;
    if (customInstructions !== undefined) patch.instructions = customInstructions;
    if (style !== undefined) patch.style = style;
    if (warmth !== undefined) patch.warmth = warmth;
    if (enthusiasm !== undefined) patch.enthusiasm = enthusiasm;
    if (headersLists !== undefined) patch.headersLists = headersLists;
    if (emoji !== undefined) patch.emoji = emoji;
    if (Object.keys(patch).length > 0) store.setPersonalization(patch);
  }

  if (partial.general) {
    const { preferredName, workDescription, aboutYou, instructions } = partial.general;
    const patch: Partial<Personalization> = {};
    if (preferredName !== undefined) {
      patch.nickname = preferredName;
      patch.nameOptedOut = preferredName.trim() === '';
    }
    if (workDescription !== undefined) patch.occupation = workDescription;
    if (typeof aboutYou === 'string') patch.aboutYou = aboutYou;
    if (instructions !== undefined) patch.instructions = instructions;
    if (Object.keys(patch).length > 0) store.setPersonalization(patch);
  }

  if (partial.notifications?.enabled !== undefined) {
    store.setNotificationsEnabled(partial.notifications.enabled);
  }

  if (partial.language?.speechLanguage !== undefined) {
    store.setSpeechLanguage(partial.language.speechLanguage);
  } else if (partial.language?.speechLocale !== undefined) {
    store.setSpeechLanguage(speechLanguageFromLegacy(partial.language.speechLocale));
  }

  if (partial.capabilities?.memory !== undefined) {
    store.setMemoryEnabled(partial.capabilities.memory);
  }
  if (partial.capabilities?.searchPastChats !== undefined) {
    store.setReferencePastChats(partial.capabilities.searchPastChats);
  }
  if (partial.capabilities?.generateFromHistory !== undefined) {
    store.setGenerateMemoryFromHistory(partial.capabilities.generateFromHistory);
  }

  if (partial.chat?.autoListen !== undefined) {
    store.setAutoListenEnabled(partial.chat.autoListen);
  }

  // profile, accessibility, editor: received and ignored on mobile (no mapped fields yet).
}
