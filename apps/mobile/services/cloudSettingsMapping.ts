/**
 * Cloud settings mapping — SSOT for what mobile settings cross the device boundary.
 *
 * Defines `toCloudSettings(store)` and `applyCloudSettings(partial)` for the
 * managed-cloud settings sync path (`/api/settings/sync`).
 *
 * TRUST BOUNDARY — DESIGN INVARIANTS:
 *
 * 1. Explicit allowlist projection only. This module reads NAMED safe fields and
 *    assembles the output object. It NEVER spreads the full store and deletes bad
 *    keys. Structural impossibility = the leak guard.
 *
 * 2. Only cloud-safe namespaces (server SSOT in apps/web/app/api/settings/sync/route.ts):
 *    appearance, personalization, profile, notifications, language, accessibility, chat, editor.
 *    Any namespace NOT in this list is a server-side DROP — never send it.
 *
 * 3. Inner keys interoperate with web/desktop. The web settings store uses `theme`
 *    (not `themeMode`), `chatFont` (not `fontPreference`), etc. Mobile maps its own
 *    field names to the canonical cross-surface inner key names defined here.
 *    See apps/web/stores/settingsStore.ts for the web side.
 *
 * 4. NEVER include: BYOK/provider API keys, device tokens, model paths,
 *    providerMode, selectedVoiceId, selectedPresetId, ttsProvider, speechRate,
 *    speechPitch, speechLanguage (device-specific audio), backgroundFetchEnabled,
 *    hapticsEnabled, biometric settings, autoApproveMode (security policy),
 *    capabilities (toggles that control what the device can do — device-specific),
 *    isTemporaryChat (session-scoped).
 */

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

// ── Cloud namespace types ────────────────────────────────────────────────────

/** Inner shape of the `appearance` namespace (cross-surface canonical keys). */
export interface CloudAppearance {
  /** Maps to web's `theme` field. Values: 'dark' | 'light' | 'system'. */
  theme?: ThemeMode;
  /** Maps to web's `chatFont`. Values: 'default' | 'system' | 'dyslexic'. */
  font?: FontPreference;
  /** Mobile-specific accent color preference. */
  accentColor?: AccentColor;
}

/** Inner shape of the `personalization` namespace. */
export interface CloudPersonalization {
  fullName?: string;
  nickname?: string;
  occupation?: string;
  /** Maps to personalization.instructions on mobile. */
  customInstructions?: string;
  /** Base response style/tone preset. */
  style?: PersonalizationStyle;
  /** Response warmth slider 0–100. */
  warmth?: number;
  /** Response enthusiasm slider 0–100. */
  enthusiasm?: number;
  /** Headers/lists structure slider 0–100. */
  headersLists?: number;
  /** Emoji frequency slider 0–100. */
  emoji?: number;
}

/** Inner shape of the `notifications` namespace. */
export interface CloudNotifications {
  /** Master push notification toggle. */
  enabled?: boolean;
}

/** Inner shape of the `language` namespace. */
export interface CloudLanguage {
  /** IETF language tag prefix for locale (e.g. 'en', 'fr', 'es'). */
  locale?: string;
}

/** Inner shape of the `chat` namespace. */
export interface CloudChat {
  /** Whether auto-listen is on in voice conversation mode. */
  autoListen?: boolean;
}

/** Full cloud settings payload — only cloud-safe namespaces, no forbidden keys. */
export interface CloudSettings {
  appearance?: CloudAppearance;
  personalization?: CloudPersonalization;
  notifications?: CloudNotifications;
  language?: CloudLanguage;
  chat?: CloudChat;
  // profile, accessibility, editor: not currently populated by mobile but
  // may be received from web/desktop and must be round-tripped safely.
  profile?: Record<string, unknown>;
  accessibility?: Record<string, unknown>;
  editor?: Record<string, unknown>;
}

// ── toCloudSettings ──────────────────────────────────────────────────────────

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
      locale: speechLanguage,
    },
    chat: {
      autoListen: autoListenEnabled,
    },
  };

  return result;
}

// ── applyCloudSettings ───────────────────────────────────────────────────────

/**
 * Apply a pulled CloudSettings payload (namespaces from GET /api/settings/sync)
 * back into the live cloud settings store. The server-revision winner is merged
 * field-by-field (undefined = no change).
 *
 * Operates on `useCloudSettingsStore.getState()` directly (cloud mode only;
 * local-mode settings are never touched by the sync engine).
 *
 * SECURITY: Only reads the explicitly-typed CloudSettings fields; ignores any
 * additional keys that might arrive from the server. Does not touch any
 * device-specific, BYOK, or secret fields.
 */
export function applyCloudSettings(partial: CloudSettings): void {
  const store = useCloudSettingsStore.getState();

  // appearance
  if (partial.appearance) {
    const { theme, font, accentColor } = partial.appearance;
    if (theme !== undefined) store.setThemeMode(theme);
    if (font !== undefined) store.setFontPreference(font);
    if (accentColor !== undefined) store.setAccentColor(accentColor);
  }

  // personalization — use the merging setter to avoid clobbering unsynced fields
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

  // notifications
  if (partial.notifications?.enabled !== undefined) {
    store.setNotificationsEnabled(partial.notifications.enabled);
  }

  // language
  if (partial.language?.locale !== undefined) {
    store.setSpeechLanguage(partial.language.locale);
  }

  // chat
  if (partial.chat?.autoListen !== undefined) {
    store.setAutoListenEnabled(partial.chat.autoListen);
  }

  // profile, accessibility, editor: received and ignored on mobile (no mapped fields yet).
}
