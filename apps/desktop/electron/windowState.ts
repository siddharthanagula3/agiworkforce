import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH } from './garnishCore';

export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplaySummary {
  workArea: WorkArea;
}

export interface WindowFrameState {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
  /** Epoch millis of the last write, so the newest frame wins a tie. */
  updatedAt: number;
}

export interface ShellWindowState {
  /** One frame per display arrangement, so two monitors do not overwrite each other. */
  frames: Record<string, WindowFrameState>;
  lastRoute: string | null;
  /** The account that was signed in when `lastRoute` was recorded. */
  lastRouteAccount: string | null;
  /** The account this shell last saw signed in, null while signed out. */
  lastAccount: string | null;
  lastWorkspace: string | null;
  secondaryPanelWidth: number | null;
  sidebarCollapsed: boolean | null;
}

/** Where a window goes when the route it held no longer resolves. */
export const NEW_CHAT_ROUTE = '/chat';

export const MIN_SECONDARY_PANEL_WIDTH = 220;
export const MAX_SECONDARY_PANEL_WIDTH = 720;
export const DEFAULT_WINDOW_WIDTH = 1280;
export const DEFAULT_WINDOW_HEIGHT = 800;
const MIN_VISIBLE_EDGE = 80;

export const EMPTY_WINDOW_STATE: ShellWindowState = {
  frames: {},
  lastRoute: null,
  lastRouteAccount: null,
  lastAccount: null,
  lastWorkspace: null,
  secondaryPanelWidth: null,
  sidebarCollapsed: null,
};

/**
 * Identifies a display by the geometry it presents, not by its id: macOS hands
 * out a fresh display id after a reboot or a cable swap, so an id-keyed frame
 * is thrown away exactly when the user still has the same two monitors.
 */
export function displayKey(display: DisplaySummary): string {
  const { x, y, width, height } = display.workArea;
  return `${width}x${height}@${x},${y}`;
}

function finiteInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

function normalizeFrame(raw: unknown): WindowFrameState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const x = finiteInt(source['x']);
  const y = finiteInt(source['y']);
  const width = finiteInt(source['width']);
  const height = finiteInt(source['height']);
  if (x === null || y === null || width === null || height === null) return null;
  if (width <= 0 || height <= 0) return null;
  return {
    x,
    y,
    width,
    height,
    maximized: source['maximized'] === true,
    updatedAt: finiteInt(source['updatedAt']) ?? 0,
  };
}

/**
 * A route is only restored when it can do no harm: an in-app path, never an
 * absolute URL, and never one of the flows whose meaning depends on the
 * request that produced it.
 */
const UNRESTORABLE_ROUTE_PREFIXES = [
  '/sign-in',
  '/sign-up',
  '/sign-out',
  '/sso-callback',
  '/oauth',
  '/api/',
  '/checkout',
  '/error',
];

export function isRestorableRoute(route: unknown): route is string {
  if (typeof route !== 'string') return false;
  const trimmed = route.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return false;
  if (trimmed.includes('..') || trimmed.length > 2_048) return false;
  const path = trimmed.split(/[?#]/)[0] ?? '';
  return !UNRESTORABLE_ROUTE_PREFIXES.some(
    (prefix) => path === prefix.replace(/\/$/, '') || path.startsWith(prefix),
  );
}

export function normalizeSecondaryPanelWidth(value: unknown): number | null {
  const width = finiteInt(value);
  if (width === null) return null;
  return Math.min(MAX_SECONDARY_PANEL_WIDTH, Math.max(MIN_SECONDARY_PANEL_WIDTH, width));
}

function normalizeWorkspace(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
}

function normalizeAccountKey(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value) ? value : null;
}

/**
 * A stable, non-reversible name for an account. `window-state.json` sits beside
 * the app in plain text, so the address itself is never written down.
 */
export function accountFingerprint(identity: {
  signedIn: boolean;
  email: string | null;
}): string | null {
  if (!identity.signedIn) return null;
  const email = identity.email?.trim().toLowerCase() ?? '';
  if (email === '') return null;
  return createHash('sha256').update(`agi-cloud-window-state:${email}`).digest('hex').slice(0, 32);
}

export function normalizeWindowState(raw: unknown): ShellWindowState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_WINDOW_STATE };
  const source = raw as Record<string, unknown>;
  const rawFrames =
    source['frames'] && typeof source['frames'] === 'object' && !Array.isArray(source['frames'])
      ? (source['frames'] as Record<string, unknown>)
      : {};
  const frames: Record<string, WindowFrameState> = {};
  for (const [key, value] of Object.entries(rawFrames)) {
    const frame = normalizeFrame(value);
    if (frame) frames[key] = frame;
  }
  return {
    frames,
    lastRoute: isRestorableRoute(source['lastRoute']) ? source['lastRoute'].trim() : null,
    lastRouteAccount: normalizeAccountKey(source['lastRouteAccount']),
    lastAccount: normalizeAccountKey(source['lastAccount']),
    lastWorkspace: normalizeWorkspace(source['lastWorkspace']),
    secondaryPanelWidth: normalizeSecondaryPanelWidth(source['secondaryPanelWidth']),
    sidebarCollapsed:
      typeof source['sidebarCollapsed'] === 'boolean' ? source['sidebarCollapsed'] : null,
  };
}

export function rememberFrame(
  state: ShellWindowState,
  display: DisplaySummary,
  frame: Omit<WindowFrameState, 'updatedAt'>,
  now: number,
): ShellWindowState {
  return {
    ...state,
    frames: { ...state.frames, [displayKey(display)]: { ...frame, updatedAt: now } },
  };
}

export function clampFrameToWorkArea(
  frame: WindowFrameState,
  workArea: WorkArea,
): WindowFrameState {
  const width = Math.min(Math.max(frame.width, MIN_WINDOW_WIDTH), workArea.width);
  const height = Math.min(Math.max(frame.height, MIN_WINDOW_HEIGHT), workArea.height);
  const maxX = workArea.x + workArea.width - MIN_VISIBLE_EDGE;
  const maxY = workArea.y + workArea.height - MIN_VISIBLE_EDGE;
  return {
    ...frame,
    width,
    height,
    x: Math.round(Math.min(Math.max(frame.x, workArea.x), Math.max(workArea.x, maxX))),
    y: Math.round(Math.min(Math.max(frame.y, workArea.y), Math.max(workArea.y, maxY))),
  };
}

/**
 * The frame to open on. A display that is still attached keeps its own frame;
 * when the display that held the window is gone the frame is pulled onto the
 * primary work area rather than discarded, so an unplugged monitor costs the
 * user their position but never their window.
 */
export function restoreFrame(
  state: ShellWindowState,
  displays: readonly DisplaySummary[],
): WindowFrameState | null {
  const primary = displays[0];
  if (!primary) return null;

  let best: { frame: WindowFrameState; workArea: WorkArea } | null = null;
  for (const display of displays) {
    const frame = state.frames[displayKey(display)];
    if (frame && (!best || frame.updatedAt > best.frame.updatedAt)) {
      best = { frame, workArea: display.workArea };
    }
  }
  if (best) return clampFrameToWorkArea(best.frame, best.workArea);

  let newest: WindowFrameState | null = null;
  for (const frame of Object.values(state.frames)) {
    if (!newest || frame.updatedAt > newest.updatedAt) newest = frame;
  }
  return newest ? clampFrameToWorkArea(newest, primary.workArea) : null;
}

/**
 * Whether the account that recorded the route is still the account this shell
 * last saw. Anything else is another account's private content.
 */
export function routeBelongsToCurrentAccount(state: ShellWindowState): boolean {
  return state.lastRouteAccount === state.lastAccount;
}

export interface WindowRestore {
  bounds: { x: number; y: number; width: number; height: number };
  maximized: boolean;
  route: string | null;
  workspace: string | null;
  secondaryPanelWidth: number | null;
  sidebarCollapsed: boolean | null;
}

function centeredDefaultBounds(workArea: WorkArea): WindowRestore['bounds'] {
  const width = Math.min(DEFAULT_WINDOW_WIDTH, workArea.width);
  const height = Math.min(DEFAULT_WINDOW_HEIGHT, workArea.height);
  return {
    width,
    height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
  };
}

/**
 * Everything a launch needs, decided from the saved state and the displays that
 * are actually attached. No Electron object is read, so a monitor that has been
 * unplugged and an account that has changed are both reachable from a test.
 */
export function resolveWindowRestore(
  state: ShellWindowState,
  displays: readonly DisplaySummary[],
): WindowRestore {
  const primary = displays[0];
  const frame = restoreFrame(state, displays);
  const bounds = frame
    ? { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
    : centeredDefaultBounds(
        primary?.workArea ?? {
          x: 0,
          y: 0,
          width: DEFAULT_WINDOW_WIDTH,
          height: DEFAULT_WINDOW_HEIGHT,
        },
      );
  const ownsRoute = routeBelongsToCurrentAccount(state);
  return {
    bounds,
    maximized: frame?.maximized ?? false,
    route: ownsRoute ? state.lastRoute : null,
    workspace: ownsRoute ? state.lastWorkspace : null,
    secondaryPanelWidth: state.secondaryPanelWidth,
    sidebarCollapsed: state.sidebarCollapsed,
  };
}

/**
 * Records who is signed in. An account this shell has not seen before drops the
 * route and workspace the previous one left behind.
 */
export function adoptAccount(state: ShellWindowState, account: string | null): ShellWindowState {
  if (account !== null && account === state.lastRouteAccount) {
    return { ...state, lastAccount: account };
  }
  return {
    ...state,
    lastAccount: account,
    lastRoute: null,
    lastRouteAccount: null,
    lastWorkspace: null,
  };
}

/** A route is only written down against the account that is looking at it. */
export function rememberRoute(
  state: ShellWindowState,
  route: string | null,
  account: string | null,
): ShellWindowState {
  if (account === null || route === null) {
    return { ...state, lastRoute: null, lastRouteAccount: null };
  }
  return { ...state, lastRoute: route, lastRouteAccount: account };
}

/**
 * A restored route that no longer resolves, most often a conversation deleted
 * from another surface, sends the window to the app root instead of leaving a
 * not-found page as the thing the app opens on.
 */
export function shouldFallBackToRoot(httpStatusCode: number | null | undefined): boolean {
  return typeof httpStatusCode === 'number' && httpStatusCode >= 400;
}

export function routeFromUrl(url: string, origin: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== new URL(origin).origin) return null;
    const route = `${parsed.pathname}${parsed.search}`;
    return isRestorableRoute(route) ? route : null;
  } catch {
    return null;
  }
}

export function readWindowState(filePath: string): ShellWindowState {
  try {
    return normalizeWindowState(JSON.parse(readFileSync(filePath, 'utf8')));
  } catch {
    return { ...EMPTY_WINDOW_STATE };
  }
}

export function writeWindowState(filePath: string, state: ShellWindowState): void {
  try {
    writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  } catch (error) {
    console.warn('[window-state] could not persist window-state.json:', error);
  }
}
