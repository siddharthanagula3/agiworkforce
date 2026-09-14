import type { DesktopRuntimeEvent, DesktopRuntimeResponse } from './protocol';

export const DESKTOP_DEEP_LINK_SCHEME = 'agiworkforce-cloud';

export const DESKTOP_DEEP_LINK_TARGETS = ['chat', 'project', 'settings'] as const;

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
export interface HostBridge {
  readonly platform: string;
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
