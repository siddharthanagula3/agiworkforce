import { PRODUCT_LINK_TARGETS } from '@agiworkforce/types';
import type { DesktopRuntimeEvent, DesktopRuntimeResponse } from './protocol';

export const DESKTOP_DEEP_LINK_SCHEME = 'agiworkforce-cloud';

export const DESKTOP_DEEP_LINK_TARGETS = [
  'chat',
  'project',
  'settings',
  ...PRODUCT_LINK_TARGETS,
] as const;

export type DesktopDeepLinkTarget = (typeof DESKTOP_DEEP_LINK_TARGETS)[number];

export interface DesktopDeepLink {
  target: DesktopDeepLinkTarget;
  id: string;
}

export function desktopDeepLink(target: DesktopDeepLinkTarget, id: string): string {
  return `${DESKTOP_DEEP_LINK_SCHEME}://${target}/${encodeURIComponent(id)}`;
}

export function parseDesktopDeepLink(url: string): DesktopDeepLink | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${DESKTOP_DEEP_LINK_SCHEME}:`) return null;

  const target = parsed.host;
  if (!(DESKTOP_DEEP_LINK_TARGETS as readonly string[]).includes(target)) return null;

  const id = decodeURIComponent(parsed.pathname.replace(/^\/+/, '').replace(/\/+$/, ''));
  if (id === '') return null;

  return { target: target as DesktopDeepLinkTarget, id };
}

/**
 * What a native menu item or a platform shortcut asks the page to do.
 *
 * These are the actions the shell cannot carry out itself: the sidebar and the
 * shortcut sheet are the page's, not the window's. The shell owns the menu, the
 * page owns the behaviour, and this union is the whole of what crosses between
 * them. It is deliberately small; a command the page cannot honour is a dead
 * menu item.
 */
export const HOST_COMMANDS = ['toggle-sidebar', 'show-keyboard-shortcuts'] as const;

export type HostCommand = (typeof HOST_COMMANDS)[number];

export function isHostCommand(value: unknown): value is HostCommand {
  return typeof value === 'string' && (HOST_COMMANDS as readonly string[]).includes(value);
}

/**
 * The desktop preferences the hosted page may read and change.
 *
 * The shell owns the values; this names them so the settings panel and the
 * main process cannot drift into two spellings of the same preference. An
 * empty accelerator means the user chose no shortcut, which is a setting
 * rather than a missing one.
 */
export const HOST_SHORTCUT_KEYS = ['quickAsk', 'screenshot', 'voice'] as const;

export type HostShortcutKey = (typeof HOST_SHORTCUT_KEYS)[number];

export const NO_HOST_SHORTCUT = '';

/**
 * The default chord for each shortcut and the alternatives offered beside it.
 *
 * One list, because the panel offering a chord the shell will not register, or
 * the shell defaulting to one the panel never shows, are the same defect seen
 * from two sides. `apps/desktop/electron/garnishCore.ts` and
 * `apps/desktop/src/lib/globalVoiceShortcut.ts` both read these.
 */
export const HOST_SHORTCUT_CHOICES: Record<HostShortcutKey, readonly string[]> = {
  quickAsk: ['Alt+Shift+Space', 'CommandOrControl+Shift+Space', 'CommandOrControl+Alt+A'],
  screenshot: ['CommandOrControl+Shift+2', 'CommandOrControl+Shift+4', 'CommandOrControl+Alt+S'],
  voice: ['Alt+Shift+V', 'CommandOrControl+Alt+V', 'CommandOrControl+Alt+D'],
};

export function defaultHostShortcut(key: HostShortcutKey): string {
  return HOST_SHORTCUT_CHOICES[key][0] ?? NO_HOST_SHORTCUT;
}

/**
 * What became of a shortcut the user asked for. `off` is the user's own
 * choice; the other three are the shell reporting that the chord did not take,
 * which the panel says out loud rather than showing a control that silently
 * does nothing.
 */
export const HOST_SHORTCUT_STATUSES = [
  'registered',
  'duplicate',
  'taken',
  'malformed',
  'off',
] as const;

export type HostShortcutStatus = (typeof HOST_SHORTCUT_STATUSES)[number];

/**
 * A chord as a person reads it. macOS writes modifiers as symbols with no
 * separator, which is what its own menus do, and every other platform spells
 * the portable `CommandOrControl` token as the key that platform actually
 * presses. The desktop settings panel and the shell's tray menu both show
 * chords, so the rendering lives here rather than in either of them.
 */
const MAC_MODIFIER_SYMBOLS: Record<string, string> = {
  commandorcontrol: '\u2318',
  cmdorctrl: '\u2318',
  command: '\u2318',
  cmd: '\u2318',
  control: '\u2303',
  ctrl: '\u2303',
  alt: '\u2325',
  option: '\u2325',
  shift: '\u21e7',
};

/**
 * Electron spells the `+` key as the word `Plus`, because the token is also its
 * separator. A macOS menu shows the character, and there is no separator to
 * confuse it with once the modifiers are symbols.
 */
const MAC_KEY_SYMBOLS: Record<string, string> = { plus: '+' };

export function describeAccelerator(accelerator: string, platform: string): string {
  if (accelerator === NO_HOST_SHORTCUT) return NO_HOST_SHORTCUT;
  const parts = accelerator.split('+');
  if (!platform.includes('darwin')) {
    return parts
      .map((part) => (/^(commandorcontrol|cmdorctrl)$/i.test(part) ? 'Ctrl' : part))
      .join('+');
  }
  return parts
    .map(
      (part) =>
        MAC_MODIFIER_SYMBOLS[part.toLowerCase()] ?? MAC_KEY_SYMBOLS[part.toLowerCase()] ?? part,
    )
    .join('');
}

export interface HostMenuShortcut {
  id: string;
  description: string;
  accelerator: string;
}

/**
 * The chords the desktop shell adds on top of the ones the page binds itself.
 *
 * A native menu accelerator never reaches the page, so the page cannot discover
 * these by listening; without a shared list the app's own shortcut sheet
 * describes a browser tab while the user is looking at a desktop window. The
 * shell builds its menu from these and the sheet renders them, so neither can
 * claim a chord the other does not have.
 *
 * The page's own bindings are not repeated here, and neither are the two
 * configurable global chords, which come from the user's preferences.
 */
export const HOST_MENU_SHORTCUTS: readonly HostMenuShortcut[] = [
  { id: 'host-new-chat', description: 'New chat', accelerator: 'CommandOrControl+N' },
  { id: 'host-settings', description: 'Settings', accelerator: 'CommandOrControl+,' },
  { id: 'host-close-window', description: 'Close window', accelerator: 'CommandOrControl+W' },
  { id: 'host-back', description: 'Back', accelerator: 'CommandOrControl+[' },
  { id: 'host-forward', description: 'Forward', accelerator: 'CommandOrControl+]' },
  { id: 'host-actual-size', description: 'Actual size', accelerator: 'CommandOrControl+0' },
  { id: 'host-zoom-in', description: 'Zoom in', accelerator: 'CommandOrControl+Plus' },
  { id: 'host-zoom-out', description: 'Zoom out', accelerator: 'CommandOrControl+-' },
];

/**
 * The platform a `HostBridge.platform` value names, as a person would say it.
 *
 * The bridge carries an id (`electron-darwin`), which is the right thing to
 * branch on and the wrong thing to show. A platform this does not recognise
 * answers null so the surface says nothing rather than printing the id.
 */
const HOST_PLATFORM_NAMES: Record<string, string> = {
  darwin: 'macOS',
  win32: 'Windows',
  linux: 'Linux',
};

export function describeHostPlatform(platform: string): string | null {
  const suffix = platform.split('-').pop() ?? '';
  return HOST_PLATFORM_NAMES[suffix] ?? null;
}

export interface HostPreferences {
  launchAtLogin: boolean;
  quickAskShortcut: string;
  screenshotShortcut: string;
  voiceShortcut: string;
  showInMenuBar: boolean;
  /**
   * Where the AGI CLI lives when it is not on the PATH the app was launched
   * with. Empty means the shell resolves `agi` from that PATH, which is what a
   * terminal install already puts there.
   */
  cliPath: string;
}

export const HOST_SHORTCUT_PREFERENCE_KEYS: Record<HostShortcutKey, keyof HostPreferences> = {
  quickAsk: 'quickAskShortcut',
  screenshot: 'screenshotShortcut',
  voice: 'voiceShortcut',
};

export interface HostPreferencesState {
  preferences: HostPreferences;
  shortcutStatus: Record<HostShortcutKey, HostShortcutStatus>;
}

export interface HostNotifyRequest {
  title: string;
  body?: string;
  /**
   * Where clicking the notification takes the user. Delivered back through the
   * deep-link subscription rather than a second channel, so one router in the
   * page resolves both an external `agiworkforce-cloud://` open and a click on
   * a notification the page itself raised.
   */
  deepLink?: string;
}

/**
 * What a build of this app offers the page it hosts, and what it installs over
 * itself to become a newer one.
 *
 * `available` false with `version` equal to `currentVersion` is the answer
 * before any release is published, not a failure: the release route reports no
 * signed installer and the shell says so rather than throwing.
 */
export interface HostUpdateAvailability {
  available: boolean;
  currentVersion: string;
  version: string;
  publishedAt?: string;
  downloadUrl: string;
}

/**
 * What the desktop shell offers a page it hosts.
 *
 * `apps/web` runs unchanged in a browser, where `window.agiHost` is absent and
 * every desktop-only control stays unrendered. The Electron preload adds
 * members beyond these; those stay in the desktop's own contract because a
 * hosted page has no business driving the window or the account bridge. The
 * updater is here instead, because the page is the shell's only settings
 * surface and a check reachable solely from the tray is one most users never
 * find.
 */
export type HostShell = 'tauri' | 'electron';

export interface HostBridge {
  readonly platform: string;
  /**
   * Which shell hosts the page. `platform` names the operating system and
   * cannot answer this: both shells run on all three.
   */
  readonly shell: HostShell;
  readonly appVersion: string;
  invokeRuntime<T = unknown>(
    command: string,
    args?: Record<string, unknown>,
  ): Promise<DesktopRuntimeResponse<T>>;
  onDeepLink(callback: (url: string) => void): () => void;
  onVoiceHotkey(callback: () => void): () => void;
  /**
   * Progress from a runtime command that outlives its response, which today is
   * a local command's output arriving line by line while it still runs.
   */
  onRuntimeEvent(callback: (event: DesktopRuntimeEvent) => void): () => void;
  onHostCommand(callback: (command: HostCommand) => void): () => void;
  readPreferences(): Promise<HostPreferencesState>;
  writePreferences(patch: Partial<HostPreferences>): Promise<HostPreferencesState>;
  openExternal(url: string): Promise<void>;
  notify(request: HostNotifyRequest): Promise<void>;
  checkForUpdate(): Promise<HostUpdateAvailability>;
  openUpdateInstaller(): Promise<void>;
}

declare global {
  interface Window {
    agiHost?: HostBridge;
  }
}

export function getHostBridge(): HostBridge | null {
  if (typeof window === 'undefined') return null;
  return window.agiHost ?? null;
}

/**
 * Whether this shell has a Local mode at all.
 *
 * AGI Cloud is the Electron shell and answers every turn in the cloud
 * (D-2026-09-15-04), so it offers no on-device model, no server address and no
 * local provider credential. A bridge that names no shell is an older build
 * than this page and is read as Cloud-only: guessing the other way renders the
 * one surface that decision forbids.
 */
export function hostHasLocalMode(bridge: HostBridge | null | undefined): boolean {
  return bridge?.shell === 'tauri';
}
