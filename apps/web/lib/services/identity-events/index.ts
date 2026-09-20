import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { IdentityProvider } from '@agiworkforce/identity';

import { logger } from '@/lib/logger';
import { recordAuditEvent, type AuditEventDetail } from '@/lib/security-audit';
import { revokeEveryDeviceRefreshCredential } from '@/lib/server/refresh-token-family';
import {
  revokeEveryOtherSession,
  type IdentitySessionOperations,
} from '@/lib/server/session-revocation';
import {
  recordIdentityObservation,
  type RiskAssessment,
  type RiskSignal,
} from '@/lib/server/risk-signals';
import {
  notifyAccountCompromiseContained,
  notifyIdentitySecurityEvent,
} from '@/lib/services/account-activity-notifications';
import { identitySecurityEventSpec, type IdentitySecurityEventKey } from './catalogue';

export * from './catalogue';

/** Where a person goes when they think the account is not theirs any more. */
export const ACCOUNT_COMPROMISE_SUPPORT_PATH = '/support';

export interface IdentitySecurityEventInput {
  userId: string;
  event: IdentitySecurityEventKey;
  subjectRef?: string | null;
  context?: string | null;
  request?: Request;
  organizationId?: string | null;
  surface?: string | null;
  deviceRef?: string | null;
  outcome?: 'success' | 'failure';
  /** Merged into the audit detail so a call site keeps what only it knows. */
  detail?: AuditEventDetail;
}

/**
 * One identity event: the person is told, the trail records it, and the risk
 * engine sees it. Notification failures never stop the audit write.
 */
export async function emitIdentitySecurityEvent(
  db: DatabaseAdapter,
  input: IdentitySecurityEventInput,
): Promise<RiskAssessment> {
  const spec = identitySecurityEventSpec(input.event);

  const assessment = await recordIdentityObservation(db, {
    userId: input.userId,
    eventKey: input.event,
    outcome: input.outcome ?? 'success',
    request: input.request,
    deviceRef: input.deviceRef ?? input.subjectRef ?? null,
    surface: input.surface ?? null,
  });

  try {
    await notifyIdentitySecurityEvent(db, {
      userId: input.userId,
      event: input.event,
      subjectRef: input.subjectRef ?? null,
      context: input.context ?? null,
    });
  } catch (error) {
    logger.warn({ error, event: input.event }, '[identity-events] notification failed');
  }

  await recordAuditEvent({
    userId: input.userId,
    eventType: spec.auditEventType,
    request: input.request,
    organizationId: input.organizationId ?? null,
    surface: input.surface ?? undefined,
    severity:
      spec.severity === 'error' ? 'critical' : spec.severity === 'warning' ? 'warning' : 'info',
    outcome: input.outcome === 'failure' ? 'failure' : 'success',
    detail: {
      resourceType: spec.resourceType,
      resourceId: input.subjectRef ?? input.event,
      ...(input.surface ? { surface: input.surface } : {}),
      ...input.detail,
    },
  });

  if (assessment.signals.length > 0) {
    await recordAuditEvent({
      userId: input.userId,
      eventType: 'risk_signal_detected',
      request: input.request,
      organizationId: input.organizationId ?? null,
      severity: assessment.level === 'compromise' ? 'critical' : 'warning',
      outcome: assessment.level === 'compromise' ? 'denied' : 'success',
      detail: {
        resourceType: 'risk_signal',
        resourceId: input.event,
        status: assessment.level,
        changedKeys: [...assessment.signals],
      },
    });
  }

  return assessment;
}

export interface CompromiseResponse {
  responseId: string;
  sessionsRevoked: number;
  sessionsFailed: number;
  deviceCredentialsRevoked: number;
  passwordResetRequired: boolean;
  supportPath: string;
}

export interface CompromiseResponseInput {
  userId: string;
  trigger: RiskSignal | 'reported';
  request?: Request;
  organizationId?: string | null;
}

/**
 * The guided response. Every session is ended, including the one that asked,
 * so nothing stays elevated and the account has to sign in again before it can
 * do anything; the password reset is what the person still owes afterwards.
 */
export async function respondToAccountCompromise(
  db: DatabaseAdapter,
  identity: IdentitySessionOperations,
  input: CompromiseResponseInput,
): Promise<CompromiseResponse> {
  const [opened] = await db.query<{ id: string }>(
    `insert into public.account_compromise_responses (user_id, trigger)
     values ($1, $2)
     returning id`,
    [input.userId, input.trigger],
  );
  const responseId = opened?.id ?? '';

  if (input.trigger === 'reported') {
    await recordAuditEvent({
      userId: input.userId,
      eventType: 'account_compromise_reported',
      request: input.request,
      organizationId: input.organizationId ?? null,
      severity: 'critical',
      detail: { resourceType: 'account', resourceId: responseId },
    });
  }

  const sweep = await revokeEveryOtherSession(identity, input.userId, null);
  const sessionsRevoked = sweep.ended.length;
  const sessionsFailed = sweep.failed.length;
  // A provider sweep leaves device credentials alive, and a live refresh row
  // mints a new session straight back.
  const deviceCredentialsRevoked = await revokeEveryDeviceRefreshCredential(db, input.userId);

  if (responseId) {
    await db.execute(
      `update public.account_compromise_responses
          set sessions_revoked = $3, sessions_failed = $4
        where id = $1 and user_id = $2`,
      [responseId, input.userId, sessionsRevoked, sessionsFailed],
    );
  }

  try {
    await notifyAccountCompromiseContained(db, {
      userId: input.userId,
      responseId: responseId || input.trigger,
      sessionsRevoked,
    });
  } catch (error) {
    logger.warn({ error, userId: input.userId }, '[identity-events] compromise notice failed');
  }

  await recordAuditEvent({
    userId: input.userId,
    eventType: 'account_compromise_contained',
    request: input.request,
    organizationId: input.organizationId ?? null,
    severity: 'critical',
    outcome: sessionsFailed > 0 || sweep.incomplete ? 'failure' : 'success',
    detail: {
      resourceType: 'account',
      resourceId: responseId || input.trigger,
      reason: input.trigger,
      count: sessionsRevoked,
      status: sweep.incomplete ? 'incomplete' : 'complete',
      deleted: deviceCredentialsRevoked,
    },
  });

  return {
    responseId,
    sessionsRevoked,
    sessionsFailed,
    deviceCredentialsRevoked,
    passwordResetRequired: true,
    supportPath: ACCOUNT_COMPROMISE_SUPPORT_PATH,
  };
}

/**
 * The entry point a route calls. A compromise signal runs the response itself
 * rather than leaving it to the caller, because a signal nobody acts on is the
 * state this exists to prevent.
 */
export async function handleIdentitySecurityEvent(
  db: DatabaseAdapter,
  identity: IdentitySessionOperations,
  input: IdentitySecurityEventInput,
): Promise<{ assessment: RiskAssessment; response: CompromiseResponse | null }> {
  const assessment = await emitIdentitySecurityEvent(db, input);
  if (assessment.level !== 'compromise') return { assessment, response: null };

  const response = await respondToAccountCompromise(db, identity, {
    userId: input.userId,
    trigger: assessment.signals[0] ?? 'reported',
    request: input.request,
    organizationId: input.organizationId ?? null,
  });
  return { assessment, response };
}

export interface OpenCompromiseResponse {
  responseId: string;
  trigger: string;
  openedAt: string;
  passwordResetRequired: boolean;
  supportPath: string;
}

export async function readOpenCompromiseResponse(
  db: DatabaseAdapter,
  userId: string,
): Promise<OpenCompromiseResponse | null> {
  const [row] = await db.query<{
    id: string;
    trigger: string;
    password_reset_required: boolean;
    opened_at: string | Date;
  }>(
    `select id, trigger, password_reset_required, opened_at
       from public.account_compromise_responses
      where user_id = $1 and resolved_at is null
      order by opened_at desc
      limit 1`,
    [userId],
  );
  if (!row) return null;
  return {
    responseId: row.id,
    trigger: row.trigger,
    openedAt: row.opened_at instanceof Date ? row.opened_at.toISOString() : row.opened_at,
    passwordResetRequired: row.password_reset_required,
    supportPath: ACCOUNT_COMPROMISE_SUPPORT_PATH,
  };
}

/**
 * What an open response still demands before it can close. Both are observed
 * rather than asserted by the caller: the provider says when this session
 * started, and the sweep says what is left signed in.
 */
export const COMPROMISE_RESOLUTION_STEPS = [
  'fresh_authentication',
  'other_sessions_ended',
] as const;

export type CompromiseResolutionStep = (typeof COMPROMISE_RESOLUTION_STEPS)[number];

export type CompromiseResolutionStatus =
  'resolved' | 'outstanding' | 'already_resolved' | 'not_found';

export interface CompromiseResolution {
  status: CompromiseResolutionStatus;
  responseId: string;
  outstanding: CompromiseResolutionStep[];
  sessionsEnded: number;
  supportPath: string;
}

export interface ResolveCompromiseResponseInput {
  userId: string;
  responseId: string;
  currentSessionId: string | null;
  /** False when the account has no second factor to present, not when one was skipped. */
  secondFactorVerified: boolean;
  request?: Request;
  organizationId?: string | null;
}

type CompromiseIdentityOperations = IdentitySessionOperations &
  Pick<IdentityProvider, 'getSession'>;

function epochMs(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Closes an open response once its steps are genuinely complete. The response
 * ends every session including the one that asked, so a session that predates
 * it belongs to someone who never had to authenticate again, and that is the
 * case this refuses: a surviving intruder session cannot clear the lockout it
 * caused. Resolving is idempotent and scoped to the owner.
 */
export async function resolveCompromiseResponse(
  db: DatabaseAdapter,
  identity: CompromiseIdentityOperations,
  input: ResolveCompromiseResponseInput,
): Promise<CompromiseResolution> {
  const base = { responseId: input.responseId, supportPath: ACCOUNT_COMPROMISE_SUPPORT_PATH };

  const [row] = await db.query<{
    id: string;
    trigger: string;
    opened_at: string | Date;
    resolved_at: string | Date | null;
  }>(
    `select id, trigger, opened_at, resolved_at
       from public.account_compromise_responses
      where id = $1 and user_id = $2`,
    [input.responseId, input.userId],
  );

  if (!row) {
    return {
      ...base,
      status: 'not_found',
      outstanding: [...COMPROMISE_RESOLUTION_STEPS],
      sessionsEnded: 0,
    };
  }
  if (row.resolved_at !== null) {
    return { ...base, status: 'already_resolved', outstanding: [], sessionsEnded: 0 };
  }

  const refuse = async (
    step: CompromiseResolutionStep,
    sessionsEnded: number,
  ): Promise<CompromiseResolution> => {
    await recordAuditEvent({
      userId: input.userId,
      eventType: 'account_compromise_resolved',
      request: input.request,
      organizationId: input.organizationId ?? null,
      severity: 'warning',
      outcome: 'denied',
      detail: {
        resourceType: 'account',
        resourceId: row.id,
        reason: row.trigger,
        status: 'outstanding',
        changedKeys: [step],
        count: sessionsEnded,
        source: input.secondFactorVerified ? 'second_factor' : 'no_second_factor',
      },
    });
    return { ...base, status: 'outstanding', outstanding: [step], sessionsEnded };
  };

  const openedAt = epochMs(row.opened_at);
  const current = input.currentSessionId ? await identity.getSession(input.currentSessionId) : null;
  const reauthenticated =
    current !== null &&
    current.userId === input.userId &&
    current.createdAt !== null &&
    current.createdAt >= openedAt;

  if (!reauthenticated) return refuse('fresh_authentication', 0);

  const sweep = await revokeEveryOtherSession(identity, input.userId, input.currentSessionId);
  const sessionsEnded = sweep.ended.length + sweep.alreadyGone.length;
  if (sweep.failed.length > 0 || sweep.incomplete) {
    return refuse('other_sessions_ended', sessionsEnded);
  }

  const cleared = await db.query<{ id: string }>(
    `update public.account_compromise_responses
        set resolved_at = now(), password_reset_required = false
      where id = $1 and user_id = $2 and resolved_at is null
      returning id`,
    [input.responseId, input.userId],
  );
  if (cleared.length === 0) {
    return { ...base, status: 'already_resolved', outstanding: [], sessionsEnded };
  }

  await recordAuditEvent({
    userId: input.userId,
    eventType: 'account_compromise_resolved',
    request: input.request,
    organizationId: input.organizationId ?? null,
    severity: 'info',
    outcome: 'success',
    detail: {
      resourceType: 'account',
      resourceId: row.id,
      reason: row.trigger,
      status: 'resolved',
      count: sessionsEnded,
      source: input.secondFactorVerified ? 'second_factor' : 'no_second_factor',
    },
  });

  return { ...base, status: 'resolved', outstanding: [], sessionsEnded };
}
