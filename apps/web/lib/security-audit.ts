/**
 * Security Audit Logging
 *
 * Logs security-relevant events to the security_audit_logs table.
 * Use this for tracking authentication failures, rate limits, authorization failures, etc.
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';

const SUPABASE_URL = process.env['NEXT_PUBLIC_SUPABASE_URL'];
const SUPABASE_SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'];

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

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
  if (!supabaseAdmin) {
    logger.warn('Supabase admin client not initialized - cannot log security event');
    return;
  }

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
    const { error } = await supabaseAdmin.from('security_audit_logs').insert({
      user_id: userId || null,
      event_type: eventType,
      severity,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      endpoint: endpoint || null,
      details,
    });

    if (error) {
      logger.error({ error, eventType, userId }, 'Failed to insert security audit log to database');
    } else {
      logger.info(
        { eventType, severity, userId, endpoint },
        'Security event logged to audit table',
      );
    }
  } catch (err) {
    logger.error({ error: err, eventType }, 'Exception while logging security event');
  }
}

/**
 * Extract IP address from request headers
 */
export function getClientIp(request: Request): string | undefined {
  // Vercel/Next.js provides this header
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return forwardedFor.split(',')[0]?.trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
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
