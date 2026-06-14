/**
 * Security Audit Logging
 *
 * Logs security-relevant events to the security_audit_logs table.
 * Use this for tracking authentication failures, rate limits, authorization failures, etc.
 *
 * SECURITY: 'server-only' import is defense-in-depth · this module must never
 * be imported by client components.
 */
import 'server-only';
import { getNeonDb } from './server/neon-db';
import { logger } from './logger';

export type SecurityEventType =
  | 'auth_failed'
  | 'rate_limit_exceeded'
  | 'authorization_failed'
  | 'suspicious_activity'
  | 'admin_action'
  | 'csrf_validation_failed'
  | 'invalid_signature';

export type SecurityEventSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityAuditEvent {
  userId?: string;
  eventType: SecurityEventType;
  severity?: SecurityEventSeverity;
  ipAddress?: string;
  userAgent?: string;
  endpoint?: string;
  details?: Record<string, unknown>;
}

/**
 * Log a security event to the audit table
 */
export async function logSecurityEvent(event: SecurityAuditEvent): Promise<void> {
  const {
    userId,
    eventType,
    severity = 'medium',
    ipAddress,
    userAgent,
    endpoint,
    details = {},
  } = event;

  try {
    const db = getNeonDb();
    await db.execute(
      `INSERT INTO security_audit_logs (user_id, event_type, severity, ip_address, user_agent, endpoint, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId || null,
        eventType,
        severity,
        ipAddress || null,
        userAgent || null,
        endpoint || null,
        JSON.stringify(details),
      ],
    );
    logger.info({ eventType, severity, userId, endpoint }, 'Security event logged to audit table');
  } catch (err) {
    logger.error({ error: err, eventType }, 'Exception while logging security event');
  }
}

/**
 * Extract IP address from request headers.
 *
 * SECURITY: Vercel (and most reverse proxies) APPEND the real client IP at
 * the END of `x-forwarded-for`. The leftmost value is client-supplied and
 * trivially spoofable via `curl -H 'X-Forwarded-For: 1.2.3.4'`. Reading the
 * leftmost IP poisons audit logs and breaks IP-based alerting (rate-limit
 * keys at `lib/rate-limit.ts:421` correctly use the rightmost · this path
 * was the divergence). Prefer `x-real-ip` (set by the platform, not client-
 * settable on Vercel), then fall back to the rightmost x-forwarded-for hop.
 */
export function getClientIp(request: Request): string | undefined {
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',').at(-1)?.trim();
  }

  return undefined;
}

/**
 * Helper to log authentication failures
 */
export async function logAuthFailure(
  request: Request,
  reason: string,
  userId?: string,
): Promise<void> {
  await logSecurityEvent({
    userId,
    eventType: 'auth_failed',
    severity: 'medium',
    ipAddress: getClientIp(request),
    userAgent: request.headers.get('user-agent') || undefined,
    endpoint: new URL(request.url).pathname,
    details: { reason },
  });
}

/**
 * Helper to log rate limit exceeded
 */
export async function logRateLimitExceeded(
  request: Request,
  identifier: string,
  userId?: string,
): Promise<void> {
  await logSecurityEvent({
    userId,
    eventType: 'rate_limit_exceeded',
    severity: 'medium',
    ipAddress: getClientIp(request),
    userAgent: request.headers.get('user-agent') || undefined,
    endpoint: new URL(request.url).pathname,
    details: { identifier },
  });
}

/**
 * Helper to log authorization failures
 */
export async function logAuthorizationFailure(
  request: Request,
  resource: string,
  action: string,
  userId?: string,
): Promise<void> {
  await logSecurityEvent({
    userId,
    eventType: 'authorization_failed',
    severity: 'high',
    ipAddress: getClientIp(request),
    userAgent: request.headers.get('user-agent') || undefined,
    endpoint: new URL(request.url).pathname,
    details: { resource, action },
  });
}

/**
 * Helper to log suspicious activity
 */
export async function logSuspiciousActivity(
  request: Request,
  description: string,
  severity: SecurityEventSeverity = 'high',
  userId?: string,
): Promise<void> {
  await logSecurityEvent({
    userId,
    eventType: 'suspicious_activity',
    severity,
    ipAddress: getClientIp(request),
    userAgent: request.headers.get('user-agent') || undefined,
    endpoint: new URL(request.url).pathname,
    details: { description },
  });
}

/**
 * Helper to log CSRF validation failures
 */
export async function logCsrfFailure(request: Request, userId?: string): Promise<void> {
  await logSecurityEvent({
    userId,
    eventType: 'csrf_validation_failed',
    severity: 'high',
    ipAddress: getClientIp(request),
    userAgent: request.headers.get('user-agent') || undefined,
    endpoint: new URL(request.url).pathname,
    details: {},
  });
}

/**
 * Helper to log invalid signature (e.g., webhook signature)
 */
export async function logInvalidSignature(
  request: Request,
  source: string,
  userId?: string,
): Promise<void> {
  await logSecurityEvent({
    userId,
    eventType: 'invalid_signature',
    severity: 'critical',
    ipAddress: getClientIp(request),
    userAgent: request.headers.get('user-agent') || undefined,
    endpoint: new URL(request.url).pathname,
    details: { source },
  });
}
