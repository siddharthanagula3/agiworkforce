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
  SettingsState,
  Personalization,
  ThemeMode,
  AccentColor,
  FontPreference,
} from '@/stores/settingsStore';
import { useSettingsStore } from '@/stores/settingsStore';

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
  /** Response warmth slider 0–100. */
  warmth?: number;
  /** Response enthusiasm slider 0–100. */
  enthusiasm?: number;
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
 * Project a snapshot of the mobile settings store into the cloud-safe namespace
 * shape. Returns the CloudSettings object that can be sent to POST /api/settings/sync.
 *
 * SECURITY: NEVER add secrets, device-specific fields, BYOK keys, or local model
 * paths here. Add only values whose meaning is identical across surfaces.
 *
 * @param store A SettingsState snapshot (from useSettingsStore.getState()).
 */
export function toCloudSettings(
  store: Pick<
    SettingsState,
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
      warmth: personalization.warmth,
      enthusiasm: personalization.enthusiasm,
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
 * back into the live mobile settings store. Uses LWW semantics: fields are only
 * updated when present in the pulled payload (undefined = no change).
 *
 * Operates on `useSettingsStore.getState()` directly (the store is shared
 * local+cloud; pull updates apply into the same store in managed mode).
 *
 * SECURITY: Only reads the explicitly-typed CloudSettings fields; ignores any
 * additional keys that might arrive from the server. Does not touch any
 * device-specific, BYOK, or secret fields.
 */
export function applyCloudSettings(partial: CloudSettings): void {
  const store = useSettingsStore.getState();

  // appearance
  if (partial.appearance) {
    const { theme, font, accentColor } = partial.appearance;
    if (theme !== undefined) store.setThemeMode(theme);
    if (font !== undefined) store.setFontPreference(font);
    if (accentColor !== undefined) store.setAccentColor(accentColor);
  }

  // personalization — use the merging setter to avoid clobbering unsynced fields
  if (partial.personalization) {
    const { fullName, nickname, occupation, customInstructions, warmth, enthusiasm } =
      partial.personalization;
    const patch: Partial<Personalization> = {};
    if (fullName !== undefined) patch.fullName = fullName;
    if (nickname !== undefined) patch.nickname = nickname;
    if (occupation !== undefined) patch.occupation = occupation;
    if (customInstructions !== undefined) patch.instructions = customInstructions;
    if (warmth !== undefined) patch.warmth = warmth;
    if (enthusiasm !== undefined) patch.enthusiasm = enthusiasm;
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
