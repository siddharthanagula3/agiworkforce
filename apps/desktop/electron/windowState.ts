import { readFileSync, writeFileSync } from 'node:fs';

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
  lastWorkspace: string | null;
  secondaryPanelWidth: number | null;
}

export const MIN_SECONDARY_PANEL_WIDTH = 220;
export const MAX_SECONDARY_PANEL_WIDTH = 720;
const MIN_VISIBLE_EDGE = 80;

export const EMPTY_WINDOW_STATE: ShellWindowState = {
  frames: {},
  lastRoute: null,
  lastWorkspace: null,
  secondaryPanelWidth: null,
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
    lastWorkspace: normalizeWorkspace(source['lastWorkspace']),
    secondaryPanelWidth: normalizeSecondaryPanelWidth(source['secondaryPanelWidth']),
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
  const width = Math.min(frame.width, workArea.width);
  const height = Math.min(frame.height, workArea.height);
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

  let best: WindowFrameState | null = null;
  for (const display of displays) {
    const frame = state.frames[displayKey(display)];
    if (frame && (!best || frame.updatedAt > best.updatedAt)) best = frame;
  }
  if (best) return best;

  let newest: WindowFrameState | null = null;
  for (const frame of Object.values(state.frames)) {
    if (!newest || frame.updatedAt > newest.updatedAt) newest = frame;
  }
  return newest ? clampFrameToWorkArea(newest, primary.workArea) : null;
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
