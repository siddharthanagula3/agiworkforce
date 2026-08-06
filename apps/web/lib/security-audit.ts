/**
 * Security Audit Logging
 *
 * Logs security-relevant events to the security_audit_logs table.
 * Use this for tracking authentication failures, rate limits, authorization failures, etc.
 *
 * This module owns the ONLY raw INSERT into `public.security_audit_logs` and the
 * only call into `public.record_enterprise_audit_event(...)`. Do not scatter raw
 * audit SQL across route handlers — add an event type here and call
 * `recordAuditEvent` instead.
 *
 * Two taxonomies live side by side on purpose:
 *   - `SecurityEventType`  — FAILURE/abuse signals (auth_failed, rate_limit_exceeded, …).
 *     `lib/services/security-monitoring-service.ts` builds an exhaustive
 *     `Record<SecurityEventType, number>` over it, so this union MUST NOT be widened.
 *   - `AuditEventType`     — successful BUSINESS events an enterprise auditor
 *     expects (sign-in, key created, member role changed, plan changed, …).
 *     These are the strings the read layer already assumes
 *     (`app/api/settings/audit-logs/actions/route.ts`,
 *     `app/api/settings/activity/route.ts`).
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
/**
 * GOV-23: `userId` must come from a SIGNATURE-VERIFIED principal.
 *
 * The caller in `lib/rate-limit.ts` used to base64-decode the Bearer payload
 * with no verification to fill this field, so an attacker could craft an
 * unsigned token carrying any `sub`, trip a rate limit, and write the abuse row
 * against another user's account. It now passes the resolved rate-limit bucket,
 * whose `user:` form is only ever produced after Clerk verification.
 *
 * `identifier` is the bucket the decision was actually made against — never a
 * client-supplied value.
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

// ═══════════════════════════════════════════════════════════════════════════
// Business audit trail
//
// Everything below records SUCCESSFUL (and explicitly denied) security-relevant
// business events — the rows the Enterprise "audit trail" claim depends on.
// The failure-signal helpers above are unchanged and stay on their own union.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Business audit actions.
 *
 * Values already consumed by the read layer are spelled exactly as the read
 * layer expects them (`login`, `logout`, `api_key_created`, `api_key_revoked`,
 * `two_factor_disabled`) so existing filters and the activity mapper light up
 * without changing those routes.
 */
export type AuditEventType =
  | 'login'
  | 'logout'
  | 'session_revoked'
  | 'device_authorization_approved'
  | 'device_authorization_denied'
  | 'api_key_created'
  | 'api_key_revoked'
  | 'connector_added'
  | 'connector_removed'
  | 'member_invited'
  | 'member_role_changed'
  | 'member_removed'
  | 'plan_changed'
  | 'checkout_started'
  | 'billing_portal_opened'
  | 'data_exported'
  | 'account_deletion_requested'
  | 'two_factor_disabled'
  | 'admin_policy_changed';

/** Matches the `outcome` CHECK on public.enterprise_audit_events. */
export type AuditOutcome = 'success' | 'failure' | 'denied';

/**
 * Matches the `severity` CHECK on public.enterprise_audit_events
 * ({info, warning, critical}). `security_audit_logs` accepts a 7-value superset
 * (0032_security_severity_superset.sql), so these three are valid for both
 * tables and no mapping is needed in either direction.
 */
export type AuditEventSeverity = 'info' | 'warning' | 'critical';

/**
 * The ONLY detail fields an audit call site may record.
 *
 * Deliberately narrow: every value here is an identifier, a name, a role, a
 * plan slug, a count or an outcome. There is no field for key material, tokens,
 * SAML assertions, SCIM bearers, Stripe secrets, prompts or message content —
 * and `sanitizeAuditDetail` drops anything not listed here at runtime, so an
 * `as never`/JS caller cannot smuggle one in either.
 */
export interface AuditEventDetail {
  resourceType?: string;
  resourceId?: string;
  resourceName?: string;
  role?: string;
  previousRole?: string;
  planTier?: string;
  previousPlanTier?: string;
  billingInterval?: string;
  connectorId?: string;
  transport?: string;
  source?: string;
  organizationId?: string;
  targetUserId?: string;
  sessionId?: string;
  subjectRef?: string;
  scopes?: string[];
  count?: number;
  reason?: string;
  status?: string;
  isCurrent?: boolean;
}

export interface AuditEvent {
  /** Authenticated actor. `null` for system actors (e.g. Stripe webhooks). */
  userId?: string | null;
  eventType: AuditEventType;
  outcome?: AuditOutcome;
  severity?: AuditEventSeverity;
  /** Request being observed · supplies IP, user-agent and endpoint. */
  request?: Request;
  /** Override when there is no Request (background/webhook actors). */
  endpoint?: string;
  detail?: AuditEventDetail;
  /**
   * When present the event is ALSO written to public.enterprise_audit_events so
   * org admins can read it through the gateway's audit-events endpoint.
   */
  organizationId?: string | null;
  /** Product surface the action came from. Defaults to 'web'. */
  surface?: string;
}

const AUDIT_DETAIL_KEYS: ReadonlySet<string> = new Set<keyof AuditEventDetail & string>([
  'resourceType',
  'resourceId',
  'resourceName',
  'role',
  'previousRole',
  'planTier',
  'previousPlanTier',
  'billingInterval',
  'connectorId',
  'transport',
  'source',
  'organizationId',
  'targetUserId',
  'sessionId',
  'subjectRef',
  'scopes',
  'count',
  'reason',
  'status',
  'isCurrent',
]);

/**
 * Second line of defence: even an allowlisted key must never carry a key name
 * that reads like credential material, in case this list is ever extended
 * carelessly.
 */
const SECRET_KEY_NAME_RE =
  /(token|secret|password|passphrase|api[-_]?key|private|credential|assertion|authorization|cookie|jwt|signature|hash|salt|seed)/i;

/** Value shapes that must never be persisted, even under a benign key. */
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /sk_(live|test)_/i, // Stripe / AGI API keys
  /\bwhsec_/i, // Stripe webhook signing secret
  /\brk_(live|test)_/i, // Stripe restricted key
  /\bgh[pousr]_[A-Za-z0-9]{16,}/, // GitHub tokens
  /\bgithub_pat_/i,
  /\bxox[abposr]-/i, // Slack tokens
  /\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./, // JWT (three-part)
  /-----BEGIN [A-Z ]*(PRIVATE KEY|CERTIFICATE)/,
  /\b(bearer|basic)\s+\S{8,}/i,
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /[A-Za-z0-9_-]{40,}/, // any long opaque blob (UUIDs and Clerk ids are shorter)
];

const REDACTED = '[redacted]';
const MAX_DETAIL_STRING = 256;
const MAX_DETAIL_ARRAY = 25;

function scrubString(value: string): string {
  const trimmed = value.length > MAX_DETAIL_STRING ? value.slice(0, MAX_DETAIL_STRING) : value;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    if (pattern.test(trimmed)) return REDACTED;
  }
  return trimmed;
}

/**
 * Reduce a caller-supplied detail object to the allowlisted, secret-free subset
 * that is safe to persist. Never throws.
 */
export function sanitizeAuditDetail(detail: AuditEventDetail | undefined): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  if (!detail || typeof detail !== 'object') return safe;

  for (const [key, value] of Object.entries(detail as Record<string, unknown>)) {
    if (!AUDIT_DETAIL_KEYS.has(key)) continue;
    if (SECRET_KEY_NAME_RE.test(key)) continue;
    if (value === undefined || value === null) continue;

    if (typeof value === 'string') {
      safe[key] = scrubString(value);
    } else if (typeof value === 'number') {
      if (Number.isFinite(value)) safe[key] = value;
    } else if (typeof value === 'boolean') {
      safe[key] = value;
    } else if (Array.isArray(value)) {
      safe[key] = value
        .slice(0, MAX_DETAIL_ARRAY)
        .filter((item): item is string => typeof item === 'string')
        .map(scrubString);
    }
    // Objects, functions and everything else are dropped — nested structures are
    // exactly how message content and token payloads leak into audit rows.
  }

  return safe;
}

/**
 * Record a security-relevant business event.
 *
 * Writes one row to `public.security_audit_logs` and, when `organizationId` is
 * supplied, one row to `public.enterprise_audit_events` via the SECURITY DEFINER
 * writer added in 0087_enterprise_audit_event_writes.sql.
 *
 * CONTRACT: this function NEVER throws and never rejects. An audit failure must
 * not break the request it observes, so both writes are swallowed at this
 * boundary and reported through the logger. This is the one place in the
 * codebase where swallowing is correct — do not re-raise from here, and do not
 * add a `throw` to any helper it calls.
 */
export async function recordAuditEvent(event: AuditEvent): Promise<void> {
  const eventType = event.eventType;
  const outcome: AuditOutcome = event.outcome ?? 'success';
  const severity: AuditEventSeverity =
    event.severity ?? (outcome === 'success' ? 'info' : 'warning');

  let detail: Record<string, unknown> = {};
  let endpoint = event.endpoint;
  let ipAddress: string | undefined;
  let userAgent: string | undefined;

  try {
    detail = sanitizeAuditDetail(event.detail);
    const request = event.request;
    if (request) {
      if (!endpoint) {
        try {
          endpoint = new URL(request.url).pathname;
        } catch {
          endpoint = undefined;
        }
      }
      ipAddress = getClientIp(request);
      userAgent = request.headers.get('user-agent') ?? undefined;
    }
  } catch (err) {
    logger.error({ error: err, eventType }, 'Failed to prepare audit event');
  }

  // The two writes are guarded INDEPENDENTLY on purpose: a failure of the
  // per-user log must not also suppress the org-scoped enterprise row (and vice
  // versa), or one broken table would silently empty the other's audit trail.

  try {
    // The read layer this table already has (`app/api/settings/audit-logs/route.ts`)
    // filters and projects on `details->>'resource_type'` / `'resource_id'` —
    // snake_case. Emitting only the camelCase names would leave its resourceType
    // filter permanently empty, so both spellings are persisted: snake_case for
    // that existing contract, camelCase for the enterprise metadata payload.
    const detailsForSecurityLog: Record<string, unknown> = { ...detail };
    if (typeof detail['resourceType'] === 'string') {
      detailsForSecurityLog['resource_type'] = detail['resourceType'];
    }
    if (typeof detail['resourceId'] === 'string') {
      detailsForSecurityLog['resource_id'] = detail['resourceId'];
    }
    // `outcome` is a first-class column on enterprise_audit_events but only a
    // detail on security_audit_logs, so mirror it into details for the
    // user-facing read paths.
    if (outcome !== 'success') {
      detailsForSecurityLog['outcome'] = outcome;
      detailsForSecurityLog['description'] = eventType;
    }

    await getNeonDb().execute(
      `INSERT INTO security_audit_logs (user_id, event_type, severity, ip_address, user_agent, endpoint, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        event.userId ?? null,
        eventType,
        severity,
        ipAddress ?? null,
        userAgent ?? null,
        endpoint ?? null,
        JSON.stringify(detailsForSecurityLog),
      ],
    );
  } catch (err) {
    // Swallow-at-boundary: see the CONTRACT note above.
    logger.error({ error: err, eventType }, 'Failed to record audit event');
  }

  if (!event.organizationId) return;

  try {
    await getNeonDb().query(
      `select public.record_enterprise_audit_event($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        event.organizationId,
        event.userId ?? null,
        event.surface ?? 'web',
        eventType,
        detail['resourceType'] ?? inferResourceType(eventType),
        detail['resourceId'] ?? null,
        outcome,
        severity,
        JSON.stringify(detail),
      ],
    );
  } catch (err) {
    logger.error({ error: err, eventType }, 'Failed to record enterprise audit event');
  }
}

/** Coarse resource classification for enterprise_audit_events.resource_type. */
function inferResourceType(eventType: AuditEventType): string {
  switch (eventType) {
    case 'login':
    case 'logout':
    case 'session_revoked':
    case 'device_authorization_approved':
    case 'device_authorization_denied':
      return 'session';
    case 'api_key_created':
    case 'api_key_revoked':
      return 'api_key';
    case 'connector_added':
    case 'connector_removed':
      return 'connector';
    case 'member_invited':
    case 'member_role_changed':
    case 'member_removed':
      return 'organization_member';
    case 'plan_changed':
    case 'checkout_started':
    case 'billing_portal_opened':
      return 'subscription';
    case 'data_exported':
      return 'user_data';
    case 'account_deletion_requested':
      return 'account';
    case 'two_factor_disabled':
      return 'two_factor';
    case 'admin_policy_changed':
      return 'organization_policy';
    default:
      return 'unknown';
  }
}
