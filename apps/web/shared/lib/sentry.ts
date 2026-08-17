/**
 * Sentry integration (OBSERVABILITY-WEB-SENTRY-01).
 *
 * Real delegations to @sentry/nextjs, isomorphic (server + browser). The API
 * surface is unchanged so existing consumers need no edits. PII safety is
 * enforced centrally in lib/sentry-shared (`sendDefaultPii: false` + a beforeSend
 * scrub that strips prompts, messages, conversation content, API keys,
 * Authorization headers, cookies, JWTs, request bodies, and user secrets before
 * any event leaves the process). Sentry is DEFAULT-DISABLED unless NODE_ENV is
 * 'production' and a DSN is configured, so when unconfigured every call no-ops.
 */
import * as SentrySDK from '@sentry/nextjs';

import { hasTelemetryConsent, isSentryConfigured } from '../../lib/sentry-shared';

export type SeverityLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';

export interface Span {
  end(): void;
}

const USER_ID_STORAGE_KEY = 'user_id';

export function setUser(user: {
  id: string;
  email?: string;
  username?: string;
  [key: string]: unknown;
}): void {
  if (!user.id) return;
  // Consent is re-read on every call, not just at init: a user who revokes
  // telemetry mid-session leaves an already-initialised SDK running, and the
  // next profile load would otherwise re-attach a stable id they opted out of.
  // hasTelemetryConsent is false on the server, where no per-user consent
  // signal exists, so server callers never attach one either.
  if (!hasTelemetryConsent()) {
    clearUser();
    return;
  }
  SentrySDK.setUser({ id: user.id });
  try {
    localStorage.setItem(USER_ID_STORAGE_KEY, user.id);
  } catch {
    // localStorage may not be available in SSR
  }
}

export function clearUser(): void {
  SentrySDK.setUser(null);
  try {
    localStorage.removeItem(USER_ID_STORAGE_KEY);
  } catch {
    // localStorage may not be available in SSR
  }
}

export function addBreadcrumb(
  message: string,
  category: 'ui.click' | 'navigation' | 'api' | 'user' | 'state' | 'error',
  data?: Record<string, unknown>,
  level: SeverityLevel = 'info',
): void {
  SentrySDK.addBreadcrumb({ message, category, data, level });
}

export function logNavigation(from: string, to: string): void {
  addBreadcrumb(`Navigation: ${from} → ${to}`, 'navigation', { from, to });
}

export function logUserAction(
  action: string,
  element?: string,
  data?: Record<string, unknown>,
): void {
  addBreadcrumb(`User action: ${action}`, 'ui.click', { element, ...data });
}

export function logApiCall(method: string, url: string, status?: number, duration?: number): void {
  addBreadcrumb(`API: ${method} ${url}`, 'api', { method, url, status, duration });
}

export function logStateChange(
  storeName: string,
  action: string,
  data?: Record<string, unknown>,
): void {
  addBreadcrumb(`State: ${storeName}/${action}`, 'state', data);
}

export function captureError(
  error: Error | string,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    level?: SeverityLevel;
    fingerprint?: string[];
  },
): string {
  const err = typeof error === 'string' ? new Error(error) : error;
  return SentrySDK.captureException(err, {
    tags: context?.tags,
    extra: context?.extra,
    level: context?.level,
    fingerprint: context?.fingerprint,
  });
}

export function captureMessage(
  message: string,
  level: SeverityLevel = 'info',
  context?: Record<string, unknown>,
): string {
  return SentrySDK.captureMessage(message, { level, extra: context });
}

export function setTags(tags: Record<string, string>): void {
  SentrySDK.setTags(tags);
}

export function setContext(name: string, context: Record<string, unknown>): void {
  SentrySDK.setContext(name, context);
}

export function startTransaction(name: string, operation: string): Span | undefined {
  if (!isSentryEnabled()) return undefined;
  const span = SentrySDK.startInactiveSpan({ name, op: operation });
  return { end: () => span.end() };
}

export async function withErrorTracking<T>(
  fn: () => Promise<T>,
  context?: {
    operation?: string;
    tags?: Record<string, string>;
  },
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    captureError(error instanceof Error ? error : new Error(String(error)), {
      ...(context?.tags ? { tags: context.tags } : {}),
      ...(context?.operation ? { extra: { operation: context.operation } } : {}),
    });
    throw error;
  }
}

export const SentryErrorBoundary: typeof SentrySDK.ErrorBoundary = SentrySDK.ErrorBoundary;

export function withProfiler<T>(component: T): T {
  return SentrySDK.withProfiler(component as Parameters<typeof SentrySDK.withProfiler>[0]) as T;
}

export function isSentryEnabled(): boolean {
  return isSentryConfigured() && SentrySDK.isInitialized();
}

export async function flush(timeout = 2000): Promise<boolean> {
  return SentrySDK.flush(timeout);
}

export const Sentry = {
  setUser: (user: Parameters<typeof SentrySDK.setUser>[0]) => SentrySDK.setUser(user),
  captureException: (err: unknown, opts?: Parameters<typeof SentrySDK.captureException>[1]) =>
    SentrySDK.captureException(err, opts),
  captureMessage: (msg: string, opts?: Parameters<typeof SentrySDK.captureMessage>[1]) =>
    SentrySDK.captureMessage(msg, opts),
  addBreadcrumb: (breadcrumb: Parameters<typeof SentrySDK.addBreadcrumb>[0]) =>
    SentrySDK.addBreadcrumb(breadcrumb),
  setTag: (key: string, value: string) => SentrySDK.setTag(key, value),
  setContext: (name: string, ctx: Parameters<typeof SentrySDK.setContext>[1]) =>
    SentrySDK.setContext(name, ctx),
  startInactiveSpan: (opts: Parameters<typeof SentrySDK.startInactiveSpan>[0]) =>
    SentrySDK.startInactiveSpan(opts),
  isInitialized: () => SentrySDK.isInitialized(),
  flush: async (timeout?: number) => SentrySDK.flush(timeout),
};
