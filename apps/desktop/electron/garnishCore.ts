import {
  DEFAULT_GLOBAL_VOICE_ACCELERATOR,
  GLOBAL_VOICE_ACCELERATOR_CHOICES,
} from '../src/lib/globalVoiceShortcut';

export interface GarnishShortcuts {
  quickAskShortcut: string;
  screenshotShortcut: string;
  voiceShortcut: string;
}

export const DEFAULT_SHORTCUTS: GarnishShortcuts = {
  quickAskShortcut: 'Alt+Shift+Space',
  screenshotShortcut: 'CommandOrControl+Shift+2',
  voiceShortcut: DEFAULT_GLOBAL_VOICE_ACCELERATOR,
};

export function isUsableAccelerator(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && !/\s/.test(value);
}

export function normalizeShortcuts(raw: unknown): GarnishShortcuts {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    quickAskShortcut: readAccelerator(source, 'quickAskShortcut'),
    screenshotShortcut: readAccelerator(source, 'screenshotShortcut'),
    voiceShortcut: readAccelerator(source, 'voiceShortcut'),
  };
}

export type ShortcutKey = keyof GarnishShortcuts;

export const SHORTCUT_KEYS: readonly ShortcutKey[] = [
  'quickAskShortcut',
  'screenshotShortcut',
  'voiceShortcut',
];

export const SHORTCUT_LABELS: Record<ShortcutKey, string> = {
  quickAskShortcut: 'Quick Ask',
  screenshotShortcut: 'Screenshot to Chat',
  voiceShortcut: 'Dictation',
};

function readAccelerator(source: Record<string, unknown>, key: ShortcutKey): string {
  const raw = source[key];
  return isUsableAccelerator(raw) ? raw : DEFAULT_SHORTCUTS[key];
}

export const SHORTCUT_CHOICES: Record<ShortcutKey, readonly string[]> = {
  quickAskShortcut: [
    DEFAULT_SHORTCUTS.quickAskShortcut,
    'CommandOrControl+Shift+Space',
    'CommandOrControl+Alt+A',
  ],
  screenshotShortcut: [
    DEFAULT_SHORTCUTS.screenshotShortcut,
    'CommandOrControl+Shift+4',
    'CommandOrControl+Alt+S',
  ],
  voiceShortcut: GLOBAL_VOICE_ACCELERATOR_CHOICES,
};

const MODIFIER_ALIASES: Record<string, string> = {
  cmdorctrl: 'commandorcontrol',
  command: 'commandorcontrol',
  cmd: 'commandorcontrol',
  control: 'control',
  ctrl: 'control',
  option: 'alt',
  alt: 'alt',
  shift: 'shift',
  super: 'meta',
  meta: 'meta',
};

/**
 * Two accelerators collide when they ask the OS for the same chord, which the
 * raw strings do not reveal: `Cmd+Alt+V` and `Alt+Command+v` are one chord
 * written two ways, and the second registration silently loses.
 */
export function acceleratorIdentity(accelerator: string): string {
  const parts = accelerator
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part !== '');
  const modifiers = new Set<string>();
  const keys: string[] = [];
  for (const part of parts) {
    const modifier = MODIFIER_ALIASES[part];
    if (modifier) modifiers.add(modifier);
    else keys.push(part);
  }
  return [...[...modifiers].sort(), ...keys].join('+');
}

/**
 * Keys whose accelerator repeats an earlier key's chord. Registration order is
 * the tiebreak, so the first key in `SHORTCUT_KEYS` keeps the chord.
 */
export function duplicateShortcutKeys(shortcuts: GarnishShortcuts): ShortcutKey[] {
  const claimed = new Map<string, ShortcutKey>();
  const duplicates: ShortcutKey[] = [];
  for (const key of SHORTCUT_KEYS) {
    const identity = acceleratorIdentity(shortcuts[key]);
    if (claimed.has(identity)) duplicates.push(key);
    else claimed.set(identity, key);
  }
  return duplicates;
}

export function shortcutChoices(key: ShortcutKey, current: string): string[] {
  const presets = SHORTCUT_CHOICES[key];
  if (!isUsableAccelerator(current) || presets.includes(current)) return [...presets];
  return [current, ...presets];
}

const MAC_MODIFIER_SYMBOLS: Record<string, string> = {
  commandorcontrol: '⌘',
  cmdorctrl: '⌘',
  command: '⌘',
  cmd: '⌘',
  control: '⌃',
  ctrl: '⌃',
  alt: '⌥',
  option: '⌥',
  shift: '⇧',
};

export function describeAccelerator(accelerator: string, platform: string): string {
  const parts = accelerator.split('+');
  if (platform !== 'darwin') {
    return parts
      .map((part) => (/^(commandorcontrol|cmdorctrl)$/i.test(part) ? 'Ctrl' : part))
      .join('+');
  }
  return parts.map((part) => MAC_MODIFIER_SYMBOLS[part.toLowerCase()] ?? part).join('');
}

export function parseSettingsFile(contents: string): GarnishShortcuts {
  try {
    return normalizeShortcuts(JSON.parse(contents));
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

export interface CapturerSourceLike {
  display_id?: string;
  id?: string;
}

export function pickSourceForDisplay<T extends CapturerSourceLike>(
  sources: readonly T[],
  displayId: number | string,
): T | null {
  if (sources.length === 0) return null;
  const wanted = String(displayId);
  const byDisplayId = sources.find((source) => source.display_id === wanted);
  if (byDisplayId) return byDisplayId;
  const bySourceId = sources.find((source) => source.id?.split(':')[1] === wanted);
  if (bySourceId) return bySourceId;
  return sources[0] ?? null;
}

export interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function centeredUpperPosition(
  workArea: RectLike,
  panelWidth: number,
  panelHeight: number,
): { x: number; y: number } {
  const x = Math.round(workArea.x + (workArea.width - panelWidth) / 2);
  const preferredY = Math.round(workArea.y + workArea.height * 0.18);
  const maxY = Math.round(workArea.y + Math.max(0, workArea.height - panelHeight));
  return { x, y: Math.min(preferredY, maxY) };
}
