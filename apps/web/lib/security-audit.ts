import 'server-only';
import { getNeonDb } from './server/neon-db';
import { logger } from './logger';
import { getKeyValueStore } from './server/key-value';

/**
 * Counts writes to `security_audit_logs` since the last anomaly check, so the
 * page-security-anomalies cron can skip Postgres entirely when nothing new was
 * written. Best-effort: a marker failure never blocks the audit write it rides
 * along with.
 */
export const SECURITY_EVENT_ACTIVITY_REDIS_KEY = 'agi-security-audit:pending-anomaly-check';
const SECURITY_EVENT_ACTIVITY_TTL_SECONDS = 3_600;

async function markSecurityEventActivity(): Promise<void> {
  try {
    const store = getKeyValueStore();
    if (!store) return;
    await store.increment(SECURITY_EVENT_ACTIVITY_REDIS_KEY);
    await store.expire(SECURITY_EVENT_ACTIVITY_REDIS_KEY, SECURITY_EVENT_ACTIVITY_TTL_SECONDS);
  } catch (error) {
    logger.error({ error }, 'Security event activity marker update failed');
  }
}

/**
 * `true`: events landed since the last check, consumed by resetting the
 * counter, so the anomaly cron should run `checkAlerts`. `false`: nothing new,
 * safe to skip Postgres. `null`: redis could not answer, so the caller should
 * fall through to running `checkAlerts` as it always has.
 */
export async function consumePendingSecurityAnomalyCheck(): Promise<boolean | null> {
  try {
    const store = getKeyValueStore();
    if (!store) return null;
    const pending = await store.get<number>(SECURITY_EVENT_ACTIVITY_REDIS_KEY);
    if (!pending) return false;
    await store.delete(SECURITY_EVENT_ACTIVITY_REDIS_KEY);
    return true;
  } catch (error) {
    logger.error({ error }, 'Security event activity marker check failed');
    return null;
  }
}

export type SecurityEventType =
  | 'auth_failed'
  | 'rate_limit_exceeded'
  | 'authorization_failed'
  | 'suspicious_activity'
  | 'admin_action'
  | 'csrf_validation_failed'
  | 'invalid_signature'
  | 'content_notice'
  | 'retention_purge';

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
    await markSecurityEventActivity();
  } catch (err) {
    logger.error({ error: err, eventType }, 'Exception while logging security event');
  }
}

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

// Every automated block names the page a user can appeal it on; a block with
// no route out is indistinguishable from a bug.
export const BLOCK_APPEAL_PATH = '/support';

export async function logRateLimitExceeded(
  request: Request,
  identifier: string,
  userId?: string,
  reason?: string,
): Promise<void> {
  await logSecurityEvent({
    userId,
    eventType: 'rate_limit_exceeded',
    severity: 'medium',
    ipAddress: getClientIp(request),
    userAgent: request.headers.get('user-agent') || undefined,
    endpoint: new URL(request.url).pathname,
    details: { identifier, ...(reason ? { reason, appealPath: BLOCK_APPEAL_PATH } : {}) },
  });
}

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
  | 'account_deletion_cancelled'
  | 'organization_deletion_requested'
  | 'organization_deletion_cancelled'
  | 'organization_deletion_blocked'
  | 'organization_deletion_completed'
  | 'two_factor_disabled'
  | 'admin_policy_changed'
  | 'retention_sweep_completed'
  | 'legal_hold_created'
  | 'legal_hold_released'
  | 'secret_detected'
  | 'spend_cap_exceeded'
  | 'ip_not_allowed'
  | 'sso_connection_created'
  | 'sso_connection_updated'
  | 'sso_connection_activated'
  | 'sso_connection_deactivated'
  | 'sso_connection_deleted'
  | 'scim_token_created'
  | 'scim_token_revoked'
  | 'directory_sync_connection_created'
  | 'directory_sync_connection_deleted'
  | 'scim_membership_granted'
  | 'scim_membership_revoked'
  | 'scim_user_provisioned'
  | 'scim_user_updated'
  | 'scim_user_deprovisioned'
  | 'scim_group_provisioned'
  | 'scim_group_updated'
  | 'scim_group_deprovisioned'
  | 'scim_group_role_mapping_changed';

export type AuditOutcome = 'success' | 'failure' | 'denied';

export type AuditEventSeverity = 'info' | 'warning' | 'critical';

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
  changedKeys?: string[];
  ipAllowListBefore?: string[];
  ipAllowListAfter?: string[];
  count?: number;
  reason?: string;
  status?: string;
  isCurrent?: boolean;
  deleted?: number;
  held?: number;
  dryRun?: boolean;
  scope?: string;
}

export interface AuditEvent {
  userId?: string | null;
  eventType: AuditEventType;
  outcome?: AuditOutcome;
  severity?: AuditEventSeverity;
  request?: Request;
  endpoint?: string;
  detail?: AuditEventDetail;
  organizationId?: string | null;
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
  'changedKeys',
  'ipAllowListBefore',
  'ipAllowListAfter',
  'deleted',
  'held',
  'dryRun',
  'scope',
  'count',
  'reason',
  'status',
  'isCurrent',
]);

const SECRET_KEY_NAME_RE =
  /(token|secret|password|passphrase|api[-_]?key|private|credential|assertion|authorization|cookie|jwt|signature|hash|salt|seed)/i;

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
  }

  return safe;
}

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

  try {
    const detailsForSecurityLog: Record<string, unknown> = { ...detail };
    if (typeof detail['resourceType'] === 'string') {
      detailsForSecurityLog['resource_type'] = detail['resourceType'];
    }
    if (typeof detail['resourceId'] === 'string') {
      detailsForSecurityLog['resource_id'] = detail['resourceId'];
    }
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
    await markSecurityEventActivity();
  } catch (err) {
    logger.error({ error: err, eventType }, 'Failed to record audit event');
  }

  if (!event.organizationId) return;

  try {
    const enterpriseMetadata: Record<string, unknown> = { ...detail };
    if (ipAddress) enterpriseMetadata['ipAddress'] = ipAddress;
    if (userAgent) enterpriseMetadata['userAgent'] = userAgent;

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
        JSON.stringify(enterpriseMetadata),
      ],
    );
  } catch (err) {
    logger.error({ error: err, eventType }, 'Failed to record enterprise audit event');
  }
}

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
    case 'account_deletion_cancelled':
      return 'account';
    case 'organization_deletion_requested':
    case 'organization_deletion_cancelled':
    case 'organization_deletion_blocked':
    case 'organization_deletion_completed':
      return 'organization';
    case 'two_factor_disabled':
      return 'two_factor';
    case 'admin_policy_changed':
      return 'organization_policy';
    case 'sso_connection_created':
    case 'sso_connection_updated':
    case 'sso_connection_activated':
    case 'sso_connection_deactivated':
    case 'sso_connection_deleted':
      return 'sso_connection';
    case 'scim_token_created':
    case 'scim_token_revoked':
      return 'scim_token';
    case 'directory_sync_connection_created':
    case 'directory_sync_connection_deleted':
      return 'directory_sync_connection';
    case 'scim_membership_granted':
    case 'scim_membership_revoked':
      return 'organization_member';
    case 'scim_user_provisioned':
    case 'scim_user_updated':
    case 'scim_user_deprovisioned':
      return 'scim_provisioned_user';
    case 'scim_group_provisioned':
    case 'scim_group_updated':
    case 'scim_group_deprovisioned':
    case 'scim_group_role_mapping_changed':
      return 'scim_group';
    default:
      return 'unknown';
  }
}
