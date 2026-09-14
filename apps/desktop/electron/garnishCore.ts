import {
  HOST_SHORTCUT_CHOICES,
  HOST_SHORTCUT_KEYS,
  HOST_SHORTCUT_PREFERENCE_KEYS,
  NO_HOST_SHORTCUT,
  defaultHostShortcut,
  describeAccelerator,
  type HostPreferences,
  type HostShortcutKey,
} from '@agiworkforce/local-runtime-contract';

/**
 * The shell's half of `HostPreferences`. The shapes come from the contract so
 * the hosted settings panel and this process cannot end up with two spellings
 * of the same preference.
 */
export type GarnishShortcuts = Pick<
  HostPreferences,
  'quickAskShortcut' | 'screenshotShortcut' | 'voiceShortcut'
>;

export const DEFAULT_SHORTCUTS: GarnishShortcuts = {
  quickAskShortcut: defaultHostShortcut('quickAsk'),
  screenshotShortcut: defaultHostShortcut('screenshot'),
  voiceShortcut: defaultHostShortcut('voice'),
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

export const SHORTCUT_KEYS: readonly ShortcutKey[] = HOST_SHORTCUT_KEYS.map(
  (key) => HOST_SHORTCUT_PREFERENCE_KEYS[key] as ShortcutKey,
);

export function hostShortcutKeyFor(key: ShortcutKey): HostShortcutKey {
  const found = HOST_SHORTCUT_KEYS.find(
    (candidate) => HOST_SHORTCUT_PREFERENCE_KEYS[candidate] === key,
  );
  if (!found) throw new Error(`${key} is not a shortcut the contract names`);
  return found;
}

export const SHORTCUT_LABELS: Record<ShortcutKey, string> = {
  quickAskShortcut: 'Quick Ask',
  screenshotShortcut: 'Screenshot to Chat',
  voiceShortcut: 'Dictation',
};

/**
 * An empty string is the user choosing no shortcut, which is a setting rather
 * than a missing value, so it survives normalisation instead of springing back
 * to the default the next time the file is read.
 */
function readAccelerator(source: Record<string, unknown>, key: ShortcutKey): string {
  const raw = source[key];
  if (raw === NO_HOST_SHORTCUT) return NO_HOST_SHORTCUT;
  return isUsableAccelerator(raw) ? raw : DEFAULT_SHORTCUTS[key];
}

export const SHORTCUT_CHOICES: Record<ShortcutKey, readonly string[]> = {
  quickAskShortcut: HOST_SHORTCUT_CHOICES.quickAsk,
  screenshotShortcut: HOST_SHORTCUT_CHOICES.screenshot,
  voiceShortcut: HOST_SHORTCUT_CHOICES.voice,
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
    if (shortcuts[key] === NO_HOST_SHORTCUT) continue;
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

export function isShortcutOff(accelerator: string): boolean {
  return accelerator === NO_HOST_SHORTCUT;
}

export { describeAccelerator };

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

export interface PickableSourceLike {
  id?: string;
  name?: string;
}

/** A dialog with forty buttons is not a picker. */
export const MAX_PICKABLE_CAPTURE_SOURCES = 12;

/**
 * The screens and windows worth offering, screens first.
 *
 * `desktopCapturer` returns every window the compositor knows about, including
 * unnamed helper surfaces that capture as a blank rectangle. Those are dropped
 * rather than listed, because a user who picks one gets an empty share and no
 * explanation.
 */
export function pickableCaptureSources<T extends PickableSourceLike>(
  sources: readonly T[],
  limit: number = MAX_PICKABLE_CAPTURE_SOURCES,
): T[] {
  const screens = sources.filter((source) => source.id?.startsWith('screen:'));
  const windows = sources.filter(
    (source) => source.id?.startsWith('window:') && (source.name ?? '').trim() !== '',
  );
  return [...screens, ...windows].slice(0, limit);
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

export interface GarnishPreferences {
  launchAtLogin: boolean;
  showInMenuBar: boolean;
  cliPath: string;
  /**
   * Chromium's zoom level, not a percentage: each step is a factor of 1.2, and
   * 0 is actual size. Held here so the window opens at the size the user last
   * chose instead of resetting every launch.
   */
  zoomLevel: number;
}

export const DEFAULT_PREFERENCES: GarnishPreferences = {
  launchAtLogin: false,
  showInMenuBar: true,
  cliPath: '',
  zoomLevel: 0,
};

export const ZOOM_LEVEL_STEP = 1;
export const MIN_ZOOM_LEVEL = -4;
export const MAX_ZOOM_LEVEL = 6;

export function clampZoomLevel(level: number): number {
  if (!Number.isFinite(level)) return DEFAULT_PREFERENCES.zoomLevel;
  return Math.min(MAX_ZOOM_LEVEL, Math.max(MIN_ZOOM_LEVEL, level));
}

export function normalizePreferences(raw: unknown): GarnishPreferences {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    launchAtLogin:
      typeof source['launchAtLogin'] === 'boolean'
        ? source['launchAtLogin']
        : DEFAULT_PREFERENCES.launchAtLogin,
    showInMenuBar:
      typeof source['showInMenuBar'] === 'boolean'
        ? source['showInMenuBar']
        : DEFAULT_PREFERENCES.showInMenuBar,
    cliPath:
      typeof source['cliPath'] === 'string'
        ? source['cliPath'].trim()
        : DEFAULT_PREFERENCES.cliPath,
    zoomLevel:
      typeof source['zoomLevel'] === 'number'
        ? clampZoomLevel(source['zoomLevel'])
        : DEFAULT_PREFERENCES.zoomLevel,
  };
}

export function parsePreferencesFile(contents: string): GarnishPreferences {
  try {
    return normalizePreferences(JSON.parse(contents));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}
