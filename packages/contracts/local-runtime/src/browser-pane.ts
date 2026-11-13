import { localPreviewUrl } from './apps';

export const BROWSER_PANE_COMMANDS = [
  'browser_pane_state',
  'browser_pane_layout',
  'browser_pane_open_tab',
  'browser_pane_close_tab',
  'browser_pane_select_tab',
  'browser_pane_navigate',
  'browser_pane_history',
  'browser_pane_capture',
  'browser_pane_close',
] as const;

export type BrowserPaneCommand = (typeof BROWSER_PANE_COMMANDS)[number];

export const BROWSER_PANE_TAB_LIMIT = 8;
export const BROWSER_PANE_TITLE_LIMIT = 200;
export const BROWSER_PANE_ADDRESS_LIMIT = 2_000;

export const BROWSER_PANE_HISTORY_ACTIONS = ['back', 'forward', 'reload', 'stop'] as const;

export type BrowserPaneHistoryAction = (typeof BROWSER_PANE_HISTORY_ACTIONS)[number];

export function isBrowserPaneHistoryAction(value: unknown): value is BrowserPaneHistoryAction {
  return (
    typeof value === 'string' && (BROWSER_PANE_HISTORY_ACTIONS as readonly string[]).includes(value)
  );
}

export interface BrowserPaneTab {
  id: string;
  title: string;
  /** Empty while the tab has not opened a page yet. */
  url: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** The page is served on this computer. */
  local: boolean;
  /** Why the last page did not load, or null. */
  failure: string | null;
}

export interface BrowserPaneState {
  tabs: BrowserPaneTab[];
  activeTabId: string | null;
  /** The last thing the pane refused to do for a page, or null. */
  notice: string | null;
}

export const EMPTY_BROWSER_PANE_STATE: BrowserPaneState = {
  tabs: [],
  activeTabId: null,
  notice: null,
};

/** Where the page is drawn, in CSS pixels of the window that holds the pane. */
export interface BrowserPaneBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserPaneLayout {
  bounds: BrowserPaneBounds;
  visible: boolean;
}

const MAX_PANE_EDGE = 20_000;

export function readBrowserPaneBounds(value: unknown): BrowserPaneBounds | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const read = (key: string): number | null => {
    const entry = record[key];
    return typeof entry === 'number' && entry >= 0 && entry <= MAX_PANE_EDGE
      ? Math.round(entry)
      : null;
  };
  const [x, y, width, height] = [read('x'), read('y'), read('width'), read('height')];
  if (x === null || y === null || width === null || height === null) return null;
  return { x, y, width, height };
}

export interface BrowserPaneCapture {
  /** A PNG of what the active tab shows, as a data URL. */
  dataUrl: string;
  width: number;
  height: number;
  url: string;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const LOOPBACK_START = /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d{1,5})?(?:[/?#]|$)/i;
const IPV4_START = /^\d{1,3}(?:\.\d{1,3}){3}(?::\d{1,5})?(?:[/?#]|$)/;
const HOST_WITH_PORT = /^[a-z0-9.-]+:\d{1,5}(?:[/?#]|$)/i;
const DOTTED_HOST = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d{1,5})?(?:[/?#]|$)/i;

/**
 * The page an address typed into the pane names, or null when it names none.
 * A bare host gets a scheme: http for this computer and for a numeric address,
 * https for a named site. Words that are not an address stay null, because the
 * pane picks no search engine on the user's behalf.
 */
export function browserPaneAddress(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const typed = raw.trim();
  if (typed === '' || typed.length > BROWSER_PANE_ADDRESS_LIMIT || /\s/.test(typed)) return null;
  const candidate =
    LOOPBACK_START.test(typed) || IPV4_START.test(typed)
      ? `http://${typed}`
      : SCHEME.test(typed) && !HOST_WITH_PORT.test(typed)
        ? typed
        : DOTTED_HOST.test(typed) || HOST_WITH_PORT.test(typed)
          ? `https://${typed}`
          : null;
  if (candidate === null) return null;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username !== '' || url.password !== '' || url.hostname === '') return null;
  return localPreviewUrl(url.href) ?? url.href;
}
