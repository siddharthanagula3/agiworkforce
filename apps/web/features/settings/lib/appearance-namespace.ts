import type {
  AccentColor,
  ChatFont,
  ChatTextSize,
  MotionPreference,
  VoiceSpeed,
} from '@shared/stores/web-settings-store';

export const APPEARANCE_NAMESPACE = 'appearance';
export const LANGUAGE_NAMESPACE = 'language';

export type SyncedTheme = 'light' | 'dark' | 'system';

export interface AppearanceSettings {
  theme: SyncedTheme;
  accentColor: AccentColor;
  chatFont: ChatFont;
  chatTextSize: ChatTextSize;
  motion: MotionPreference;
  highContrast: boolean;
  codeBlockWrap: boolean;
  dictationEnabled: boolean;
  voiceSpeed: VoiceSpeed;
  hiddenNavIds: string[];
}

export interface AppearanceNamespace {
  theme?: SyncedTheme;
  accentColor?: string;
  font?: string;
  textSize?: ChatTextSize;
  motion?: MotionPreference;
  highContrast?: boolean;
  codeBlockWrap?: boolean;
  dictationEnabled?: boolean;
  voiceSpeed?: VoiceSpeed;
  hiddenNavIds?: string[];
}

// Mobile's vocabulary (cloudSettingsMapping.ts), so the two surfaces share one
// copy. Mobile's 'neutral' has no web equivalent and is absent from the reverse
// map on purpose: hydrating it must leave web alone, not repaint it amber.
const ACCENT_TO_CLOUD: Readonly<Record<AccentColor, string>> = {
  default: 'amber',
  green: 'green',
  blue: 'blue',
  violet: 'violet',
  rose: 'rose',
};

const CLOUD_TO_ACCENT: Readonly<Record<string, AccentColor>> = {
  amber: 'default',
  green: 'green',
  blue: 'blue',
  violet: 'violet',
  rose: 'rose',
};

const FONT_TO_CLOUD: Readonly<Record<ChatFont, string>> = {
  default: 'default',
  sans: 'system',
  serif: 'serif',
  dyslexic: 'dyslexic',
};

const CLOUD_TO_FONT: Readonly<Record<string, ChatFont>> = {
  default: 'default',
  system: 'sans',
  sans: 'sans',
  serif: 'serif',
  dyslexic: 'dyslexic',
};

const THEMES: readonly SyncedTheme[] = ['light', 'dark', 'system'];
const TEXT_SIZES: readonly ChatTextSize[] = ['small', 'default', 'large'];
const MOTIONS: readonly MotionPreference[] = ['system', 'reduced'];
const VOICE_SPEEDS: readonly VoiceSpeed[] = ['slow', 'normal', 'fast'];

function oneOf<T extends string>(options: readonly T[], value: unknown): T | undefined {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function stringList(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? (value as string[])
    : undefined;
}

export function toAppearanceNamespace(settings: AppearanceSettings): Required<AppearanceNamespace> {
  return {
    theme: settings.theme,
    accentColor: ACCENT_TO_CLOUD[settings.accentColor],
    font: FONT_TO_CLOUD[settings.chatFont],
    textSize: settings.chatTextSize,
    motion: settings.motion,
    highContrast: settings.highContrast,
    codeBlockWrap: settings.codeBlockWrap,
    dictationEnabled: settings.dictationEnabled,
    voiceSpeed: settings.voiceSpeed,
    hiddenNavIds: settings.hiddenNavIds,
  };
}

export function fromAppearanceNamespace(stored: unknown): Partial<AppearanceSettings> {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  const source = stored as Record<string, unknown>;
  const patch: Partial<AppearanceSettings> = {};

  const theme = oneOf(THEMES, source['theme']);
  if (theme) patch.theme = theme;

  const accent = typeof source['accentColor'] === 'string' ? source['accentColor'] : '';
  if (CLOUD_TO_ACCENT[accent]) patch.accentColor = CLOUD_TO_ACCENT[accent];

  const font = typeof source['font'] === 'string' ? source['font'] : '';
  if (CLOUD_TO_FONT[font]) patch.chatFont = CLOUD_TO_FONT[font];

  const textSize = oneOf(TEXT_SIZES, source['textSize']);
  if (textSize) patch.chatTextSize = textSize;

  const motion = oneOf(MOTIONS, source['motion']);
  if (motion) patch.motion = motion;

  const highContrast = boolean(source['highContrast']);
  if (highContrast !== undefined) patch.highContrast = highContrast;

  const codeBlockWrap = boolean(source['codeBlockWrap']);
  if (codeBlockWrap !== undefined) patch.codeBlockWrap = codeBlockWrap;

  const dictationEnabled = boolean(source['dictationEnabled']);
  if (dictationEnabled !== undefined) patch.dictationEnabled = dictationEnabled;

  const voiceSpeed = oneOf(VOICE_SPEEDS, source['voiceSpeed']);
  if (voiceSpeed) patch.voiceSpeed = voiceSpeed;

  const hiddenNavIds = stringList(source['hiddenNavIds']);
  if (hiddenNavIds) patch.hiddenNavIds = hiddenNavIds;

  return patch;
}

export function appearanceDelta(
  acknowledged: AppearanceNamespace | null,
  next: Required<AppearanceNamespace>,
): AppearanceNamespace | null {
  if (!acknowledged) return next;
  const delta: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next)) {
    const previous = (acknowledged as Record<string, unknown>)[key];
    const changed = Array.isArray(value)
      ? JSON.stringify(previous) !== JSON.stringify(value)
      : previous !== value;
    if (changed) delta[key] = value;
  }
  return Object.keys(delta).length > 0 ? (delta as AppearanceNamespace) : null;
}

export function readStoredLocale(stored: unknown, supported: readonly string[]): string | null {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;
  const locale = (stored as Record<string, unknown>)['locale'];
  return typeof locale === 'string' && supported.includes(locale) ? locale : null;
}
