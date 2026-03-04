/**
 * Sentry Integration Stubs
 *
 * No-op implementations that maintain the same API surface
 * so existing imports continue to work without installing @sentry/react.
 */

export type SeverityLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';

export interface Span {
  end(): void;
}

/* ---------- user context ---------- */

export function setUser(user: {
  id: string;
  email?: string;
  username?: string;
  [key: string]: unknown;
}): void {
  if (user.id) {
    try {
      localStorage.setItem('user_id', user.id);
    } catch {
      // localStorage may not be available in SSR
    }
  }
}

export function clearUser(): void {
  try {
    localStorage.removeItem('user_id');
  } catch {
    // localStorage may not be available in SSR
  }
}

/* ---------- breadcrumbs ---------- */

export function addBreadcrumb(
  _message: string,
  _category: 'ui.click' | 'navigation' | 'api' | 'user' | 'state' | 'error',
  _data?: Record<string, unknown>,
  _level: SeverityLevel = 'info',
): void {
  // no-op
}

export function logNavigation(_from: string, _to: string): void {
  // no-op
}

export function logUserAction(
  _action: string,
  _element?: string,
  _data?: Record<string, unknown>,
): void {
  // no-op
}

export function logApiCall(
  _method: string,
  _url: string,
  _status?: number,
  _duration?: number,
): void {
  // no-op
}

export function logStateChange(
  _storeName: string,
  _action: string,
  _data?: Record<string, unknown>,
): void {
  // no-op
}

/* ---------- capture ---------- */

export function captureError(
  _error: Error | string,
  _context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    level?: SeverityLevel;
    fingerprint?: string[];
  },
): string {
  return '';
}

export function captureMessage(
  _message: string,
  _level: SeverityLevel = 'info',
  _context?: Record<string, unknown>,
): string {
  return '';
}

/* ---------- tags / context ---------- */

export function setTags(_tags: Record<string, string>): void {
  // no-op
}

export function setContext(_name: string, _context: Record<string, unknown>): void {
  // no-op
}

/* ---------- performance ---------- */

export function startTransaction(_name: string, _operation: string): Span | undefined {
  return undefined;
}

/* ---------- error tracking wrapper ---------- */

export async function withErrorTracking<T>(
  fn: () => Promise<T>,
  _context?: {
    operation?: string;
    tags?: Record<string, string>;
  },
): Promise<T> {
  return fn();
}

/* ---------- re-exports that mirror old API ---------- */

export const SentryErrorBoundary = undefined;

export function withProfiler<T>(component: T): T {
  return component;
}

export function isSentryEnabled(): boolean {
  return false;
}

export async function flush(_timeout = 2000): Promise<boolean> {
  return true;
}

// Stub Sentry namespace for direct-access imports
export const Sentry = {
  setUser: (_user: unknown) => {},
  captureException: (_err: unknown, _opts?: unknown) => '',
  captureMessage: (_msg: string, _opts?: unknown) => '',
  addBreadcrumb: (_breadcrumb: unknown) => {},
  setTag: (_key: string, _value: string) => {},
  setContext: (_name: string, _ctx: unknown) => {},
  startInactiveSpan: (_opts: unknown) => undefined,
  isInitialized: () => false,
  flush: async (_timeout?: number) => true,
  showReportDialog: (_opts?: unknown) => {},
  ErrorBoundary: undefined,
  withProfiler: <T>(c: T) => c,
};
