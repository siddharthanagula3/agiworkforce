import { localPreviewUrl } from './apps';

export const BROWSER_PANE_COMMANDS = [
  'browser_pane_open',
  'browser_pane_navigate',
  'browser_pane_back',
  'browser_pane_forward',
  'browser_pane_reload',
  'browser_pane_bounds',
  'browser_pane_hide',
  'browser_pane_close',
  'browser_pane_state',
  'browser_sites_read',
  'browser_sites_remove',
  'browser_sites_block',
  'browser_pane_clear_data',
] as const;

export type BrowserPaneCommand = (typeof BROWSER_PANE_COMMANDS)[number];

export const MAX_BROWSER_SITES = 200;
export const MAX_BROWSER_ADDRESS_LENGTH = 2_000;

export interface BrowserPaneBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserPaneState {
  open: boolean;
  url: string | null;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** The site the last navigation was refused for, until the next one starts. */
  refusedHost: string | null;
}

export const CLOSED_BROWSER_PANE: BrowserPaneState = {
  open: false,
  url: null,
  title: '',
  loading: false,
  canGoBack: false,
  canGoForward: false,
  refusedHost: null,
};

export interface BrowserSites {
  allowed: string[];
  blocked: string[];
}

export type BrowserPaneDecision = 'loopback' | 'allowed' | 'blocked' | 'ask';

const HOST_PATTERN = /^[a-z0-9.-]+$/;

export function browserSiteHost(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase().replace(/\.$/, '');
  if (trimmed === '' || trimmed.length > 253 || !HOST_PATTERN.test(trimmed)) return null;
  if (trimmed.startsWith('.') || trimmed.includes('..')) return null;
  return trimmed;
}

/** What someone typed in the address bar, as a page address, or null when it is not one. */
export function browserPaneAddress(input: string): string | null {
  const text = input.trim();
  if (text === '' || text.length > MAX_BROWSER_ADDRESS_LENGTH || /\s/.test(text)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
    ? text
    : /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(text)
      ? `http://${text}`
      : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username !== '' || url.password !== '') return null;
  if (!browserSiteHost(url.hostname.replace(/^\[|\]$/g, '')) && !localPreviewUrl(url.href)) {
    return null;
  }
  return localPreviewUrl(url.href) ?? url.href;
}

function matches(host: string, site: string): boolean {
  return host === site || host.endsWith(`.${site}`);
}

/**
 * Whether the pane may show a page. Blocked sites lose to everything, this
 * computer's own addresses always open, an allowed site covers its subdomains,
 * and any other site is asked about first.
 */
export function browserPaneDecision(url: string, sites: BrowserSites): BrowserPaneDecision {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'blocked';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'blocked';
  if (parsed.username !== '' || parsed.password !== '') return 'blocked';
  const host = parsed.hostname.toLowerCase();
  if (sites.blocked.some((site) => matches(host, site))) return 'blocked';
  if (localPreviewUrl(parsed.href)) return 'loopback';
  if (sites.allowed.some((site) => matches(host, site))) return 'allowed';
  return 'ask';
}
