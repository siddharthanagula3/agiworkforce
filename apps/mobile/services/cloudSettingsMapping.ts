
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
}

export interface CloudNotifications {
  enabled?: boolean;
}

export interface CloudLanguage {
  locale?: string;
  speechLocale?: string;
}

export interface CloudChat {
  autoListen?: boolean;
}

export interface CloudCapabilities {
  memory?: boolean;
  generateFromHistory?: boolean;
}

export interface CloudSettings {
  appearance?: CloudAppearance;
  personalization?: CloudPersonalization;
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
    },
    notifications: {
      enabled: notificationsEnabled,
    },
    language: {
      speechLocale: speechLanguage,
    },
    ...(memoryPolicyInitialized
      ? {
          capabilities: {
            memory: referencePastChats,
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
    } = partial.personalization;
    const patch: Partial<Personalization> = {};
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

  if (partial.notifications?.enabled !== undefined) {
    store.setNotificationsEnabled(partial.notifications.enabled);
  }

  if (partial.language?.speechLocale !== undefined) {
    store.setSpeechLanguage(partial.language.speechLocale);
  }

  if (partial.capabilities?.memory !== undefined) {
    store.setReferencePastChats(partial.capabilities.memory);
  }
  if (partial.capabilities?.generateFromHistory !== undefined) {
    store.setGenerateMemoryFromHistory(partial.capabilities.generateFromHistory);
  }

  if (partial.chat?.autoListen !== undefined) {
    store.setAutoListenEnabled(partial.chat.autoListen);
  }

  // profile, accessibility, editor: received and ignored on mobile (no mapped fields yet).
}
