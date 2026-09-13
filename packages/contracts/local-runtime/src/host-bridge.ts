import type { DesktopRuntimeResponse } from './protocol';

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
 * What the desktop shell offers a page it hosts.
 *
 * `apps/web` runs unchanged in a browser, where `window.agiHost` is absent and
 * every desktop-only control stays unrendered. The Electron preload adds
 * members beyond these; they stay in the desktop's own contract because a
 * hosted page has no business driving the window, the account bridge, or the
 * updater.
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
  openExternal(url: string): Promise<void>;
  notify(request: HostNotifyRequest): Promise<void>;
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
