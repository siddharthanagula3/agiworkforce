export const SESSION_ABSOLUTE_LIFETIME_HOURS_ENV = 'SESSION_ABSOLUTE_LIFETIME_HOURS';

const DEFAULT_ABSOLUTE_LIFETIME_HOURS = 30 * 24;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Measured from session creation, not last use: the provider's inactivity window
 * renews on every request and so never ends a session that is being used.
 */
export function sessionAbsoluteLifetimeMs(): number {
  const configured = process.env[SESSION_ABSOLUTE_LIFETIME_HOURS_ENV]?.trim();
  if (!configured) return DEFAULT_ABSOLUTE_LIFETIME_HOURS * HOUR_MS;

  const hours = Number(configured);
  if (!Number.isFinite(hours) || hours <= 0) {
    return DEFAULT_ABSOLUTE_LIFETIME_HOURS * HOUR_MS;
  }
  return hours * HOUR_MS;
}

export function sessionAbsoluteDeadline(createdAt: number | null): number | null {
  return createdAt === null ? null : createdAt + sessionAbsoluteLifetimeMs();
}

export function hasOutlivedAbsoluteLifetime(createdAt: number | null, now: number): boolean {
  const deadline = sessionAbsoluteDeadline(createdAt);
  return deadline !== null && deadline <= now;
}

/**
 * `idle` is the provider's own expiry, which renews on use and so ends a session
 * that stopped being used; `absolute` is this product's cap on total age.
 */
export type SessionLifetimeBound = 'idle' | 'absolute';

export interface SessionLifetime {
  createdAt: number | null;
  expireAt: number | null;
}

export function hasOutlivedIdleLifetime(expireAt: number | null, now: number): boolean {
  return expireAt !== null && expireAt <= now;
}

/**
 * The one answer to "should this session still be honoured". Both bounds are
 * asked here so a caller cannot enforce one and forget the other.
 */
export function sessionLifetimeExceeded(
  session: SessionLifetime,
  now: number,
): SessionLifetimeBound | null {
  if (hasOutlivedAbsoluteLifetime(session.createdAt, now)) return 'absolute';
  if (hasOutlivedIdleLifetime(session.expireAt, now)) return 'idle';
  return null;
}

export const SESSION_LIFETIME_AUDIT_SOURCE: Readonly<Record<SessionLifetimeBound, string>> =
  Object.freeze({
    absolute: 'absolute_session_timeout',
    idle: 'idle_session_timeout',
  });
