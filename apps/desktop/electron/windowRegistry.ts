import { NEW_CHAT_ROUTE, isRestorableRoute, type WorkArea } from './windowState';
import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH } from './garnishCore';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OpenWindow {
  id: number;
  /** True for the window the app opens on, which owns the remembered frame. */
  primary: boolean;
  route: string;
  bounds: WindowBounds;
}

/**
 * A conversation is the one thing a route can name that two windows must not
 * both hold: it is the only route with an unsent draft and a running turn
 * behind it. `web_conversations.id` is a uuid, so this never mistakes a section
 * under `/chat` for a conversation and never needs a copy of the route table.
 */
const CONVERSATION_ROUTE_PREFIX = `${NEW_CHAT_ROUTE}/`;
const CONVERSATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const WINDOW_CASCADE_OFFSET = 32;

export function conversationIdFromRoute(route: string): string | null {
  if (typeof route !== 'string' || !route.startsWith(CONVERSATION_ROUTE_PREFIX)) return null;
  const path = route.slice(CONVERSATION_ROUTE_PREFIX.length).split(/[?#]/)[0] ?? '';
  const segment = path.split('/')[0] ?? '';
  return CONVERSATION_ID.test(segment) ? segment.toLowerCase() : null;
}

export function windowHoldingConversation(
  windows: readonly OpenWindow[],
  conversationId: string,
): OpenWindow | null {
  return windows.find((window) => conversationIdFromRoute(window.route) === conversationId) ?? null;
}

export type WindowOpenPlan =
  | { action: 'focus'; windowId: number }
  | { action: 'create'; route: string }
  | { action: 'refuse'; reason: 'route-not-openable' };

/**
 * What asking for a route in its own window does.
 *
 * A conversation already on screen is raised rather than duplicated. Two
 * windows on one conversation would each hold their own composer draft and
 * each believe it owns the turn, so the second one is not opened at all: there
 * is never a second editor to reconcile with.
 */
export function planWindowOpen(windows: readonly OpenWindow[], route: string): WindowOpenPlan {
  if (!isRestorableRoute(route)) return { action: 'refuse', reason: 'route-not-openable' };
  const trimmed = route.trim();
  const conversationId = conversationIdFromRoute(trimmed);
  if (conversationId === null) return { action: 'create', route: trimmed };
  const holder = windowHoldingConversation(windows, conversationId);
  return holder ? { action: 'focus', windowId: holder.id } : { action: 'create', route: trimmed };
}

/**
 * A window that has navigated onto a conversation another window already holds.
 *
 * The window that had it keeps it, because that is the one whose draft and
 * running turn belong to it; the newcomer is sent back to the route it came
 * from. Returning `null` is the ordinary case and costs nothing.
 */
export function resolveNavigationConflict(
  windows: readonly OpenWindow[],
  windowId: number,
  route: string,
): { focus: number } | null {
  const conversationId = conversationIdFromRoute(route);
  if (conversationId === null) return null;
  const holder = windows.find(
    (window) => window.id !== windowId && conversationIdFromRoute(window.route) === conversationId,
  );
  return holder ? { focus: holder.id } : null;
}

/**
 * Where a second window opens.
 *
 * Stepped down and across from the window it was opened from, then pulled back
 * inside the work area, so a new window never lands exactly on top of the one
 * that spawned it and never opens with its title bar off the screen.
 */
export function cascadeBounds(
  from: WindowBounds,
  taken: readonly WindowBounds[],
  workArea: WorkArea,
): WindowBounds {
  const width = Math.min(Math.max(from.width, MIN_WINDOW_WIDTH), workArea.width);
  const height = Math.min(Math.max(from.height, MIN_WINDOW_HEIGHT), workArea.height);
  const maxX = workArea.x + workArea.width - width;
  const maxY = workArea.y + workArea.height - height;

  let step = 1;
  let candidate = { x: from.x, y: from.y, width, height };
  while (step <= taken.length + 1) {
    const x = from.x + WINDOW_CASCADE_OFFSET * step;
    const y = from.y + WINDOW_CASCADE_OFFSET * step;
    candidate = {
      width,
      height,
      x: Math.round(Math.min(Math.max(x, workArea.x), Math.max(workArea.x, maxX))),
      y: Math.round(Math.min(Math.max(y, workArea.y), Math.max(workArea.y, maxY))),
    };
    if (!taken.some((bounds) => bounds.x === candidate.x && bounds.y === candidate.y)) {
      return candidate;
    }
    step += 1;
  }
  return candidate;
}

export interface SignOutPlan {
  /** Secondary windows, which hold another account's routes the moment it changes. */
  close: number[];
  /** The window kept open, sent back to the signed-out root. */
  keep: number | null;
}

/**
 * Signing out in one window signs out of the app, not of that window: the
 * session, the tokens and the identity all live in the main process. Every
 * other window is showing a page the account behind it no longer owns, so the
 * secondaries close and the primary returns to the root.
 */
export function planSignOut(windows: readonly OpenWindow[]): SignOutPlan {
  const primary = windows.find((window) => window.primary) ?? windows[0] ?? null;
  return {
    close: windows.filter((window) => window.id !== primary?.id).map((window) => window.id),
    keep: primary?.id ?? null,
  };
}

export interface RuntimeEventTarget {
  isDestroyed(): boolean;
  send(channel: string, event: unknown): void;
}

/**
 * A runtime event is app state, not window state: a permission answered, a
 * shell policy changed, the browser pairing lost. It goes to every window,
 * because addressing only the first one leaves the others showing a permission
 * that has since been revoked. Returns how many were told.
 */
export function broadcastRuntimeEvent(
  targets: Iterable<RuntimeEventTarget>,
  channel: string,
  event: unknown,
): number {
  let delivered = 0;
  for (const target of targets) {
    if (target.isDestroyed()) continue;
    target.send(channel, event);
    delivered += 1;
  }
  return delivered;
}
