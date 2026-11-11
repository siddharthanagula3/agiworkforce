import 'server-only';

import { randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { IdentityProvider } from '@agiworkforce/identity';
import { createError } from '@agiworkforce/utils';

import { logger } from '@/lib/logger';
import { recordAuditEvent, type AuditEventDetail } from '@/lib/security-audit';
import { SESSION_STATUS_ACTIVE } from '@/lib/server/session-status';
import { revokeEveryDeviceRefreshCredential } from '@/lib/server/refresh-token-family';
import {
  finishIntentRevocation,
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
  identitySubject?: string;
  event: IdentitySecurityEventKey;
  subjectRef?: string | null;
  noticeRef?: string | null;
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
      subjectRef: input.noticeRef ?? input.subjectRef ?? randomUUID(),
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
  identitySubject?: string;
  trigger: RiskSignal | 'reported';
  request?: Request;
  organizationId?: string | null;
}

export async function respondToAccountCompromise(
  db: DatabaseAdapter,
  identity: IdentitySessionOperations,
  input: CompromiseResponseInput,
): Promise<CompromiseResponse> {
  const opened = await db.query<{ id: string }>(
    `insert into public.account_compromise_responses (user_id, trigger)
     values ($1, $2)
     returning id`,
    [input.userId, input.trigger],
  );
  const receipt = singleCompromiseReceipt(opened);
  if (!receipt) {
    throw createError
      .serviceUnavailable('Could not confirm that the compromise response was recorded.')
      .asUserSafe();
  }
  const responseId = receipt.id;

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

  const sweep = await revokeEveryOtherSession(identity, input.userId, null, input.identitySubject);
  const intentRevoked = await finishIntentRevocation(sweep, input.userId);
  const sessionsRevoked = sweep.ended.length;
  const sessionsFailed = sweep.failed.length;
  const cleanupIncomplete = sessionsFailed > 0 || sweep.incomplete || !intentRevoked;
  // A provider sweep leaves device credentials alive, and a live refresh row
  // mints a new session straight back.
  const deviceCredentialsRevoked = await revokeEveryDeviceRefreshCredential(db, input.userId);

  const updated = await db.query(
    `update public.account_compromise_responses
        set sessions_revoked = $3, sessions_failed = $4
      where id = $1 and user_id = $2
      returning id, user_id, sessions_revoked, sessions_failed`,
    [responseId, input.userId, sessionsRevoked, sessionsFailed],
  );
  const reportReceipt = singleCompromiseReceipt(updated);
  if (
    !reportReceipt ||
    Array.isArray(reportReceipt) ||
    !sameCompromiseResponseId(reportReceipt.id, responseId) ||
    typeof reportReceipt['user_id'] !== 'string' ||
    reportReceipt['user_id'] !== input.userId ||
    !Number.isInteger(sessionsRevoked) ||
    sessionsRevoked < 0 ||
    !Number.isInteger(sessionsFailed) ||
    sessionsFailed < 0 ||
    reportReceipt['sessions_revoked'] !== sessionsRevoked ||
    reportReceipt['sessions_failed'] !== sessionsFailed
  ) {
    throw createError
      .serviceUnavailable(
        'Could not confirm the compromise report update. Some sessions may already have been signed out.',
      )
      .asUserSafe();
  }

  try {
    await notifyAccountCompromiseContained(db, {
      userId: input.userId,
      responseId: responseId || input.trigger,
      sessionsRevoked,
      cleanupIncomplete,
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
    outcome: cleanupIncomplete ? 'failure' : 'success',
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
    ...(input.identitySubject !== undefined ? { identitySubject: input.identitySubject } : {}),
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
const COMPROMISE_RESOLUTION_STEPS = ['fresh_authentication', 'other_sessions_ended'] as const;

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

function epochMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  return typeof value === 'string' ? new Date(value).getTime() : Number.NaN;
}

function singleCompromiseReceipt(rows: unknown): (Record<string, unknown> & { id: string }) | null {
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const row: unknown = rows[0];
  if (row === null || typeof row !== 'object' || !('id' in row)) return null;
  if (typeof row.id !== 'string' || row.id.trim().length === 0) return null;
  return row as Record<string, unknown> & { id: string };
}

function sameCompromiseResponseId(actual: string, expected: string): boolean {
  if (actual === expected) return true;
  const normalize = (value: string): string | null => {
    const unwrapped = value.startsWith('{') && value.endsWith('}') ? value.slice(1, -1) : value;
    if (!/^[a-f0-9]{4}(?:-?[a-f0-9]{4}){7}$/i.test(unwrapped)) return null;
    return unwrapped.replaceAll('-', '').toLowerCase();
  };
  const normalized = normalize(actual);
  return normalized !== null && normalized === normalize(expected);
}

function confirmsCompromiseResolution(rows: unknown, responseId: string): boolean {
  const row = singleCompromiseReceipt(rows);
  return (
    row !== null &&
    sameCompromiseResponseId(row.id, responseId) &&
    row['password_reset_required'] === false &&
    Number.isFinite(epochMs(row['resolved_at']))
  );
}

export async function resolveCompromiseResponse(
  db: DatabaseAdapter,
  identity: CompromiseIdentityOperations,
  input: ResolveCompromiseResponseInput,
): Promise<CompromiseResolution> {
  const base = { responseId: input.responseId, supportPath: ACCOUNT_COMPROMISE_SUPPORT_PATH };

  const rows = await db.query<{
    id: string;
    trigger: string;
    opened_at: string | Date;
    resolved_at: string | Date | null;
    password_reset_required: boolean;
  }>(
    `select id, trigger, opened_at, resolved_at, password_reset_required
       from public.account_compromise_responses
      where id = $1 and user_id = $2`,
    [input.responseId, input.userId],
  );

  if (Array.isArray(rows) && rows.length === 0) {
    return {
      ...base,
      status: 'not_found',
      outstanding: [...COMPROMISE_RESOLUTION_STEPS],
      sessionsEnded: 0,
    };
  }
  const row = rows?.[0];
  if (
    !singleCompromiseReceipt(rows) ||
    !row ||
    !sameCompromiseResponseId(row.id, input.responseId)
  ) {
    throw createError
      .serviceUnavailable('Could not confirm the state of this compromise response.')
      .asUserSafe();
  }
  if (row.resolved_at !== null) {
    if (!confirmsCompromiseResolution(rows, input.responseId)) {
      throw createError
        .serviceUnavailable('Could not confirm that this response was resolved.')
        .asUserSafe();
    }
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
    current.id === input.currentSessionId &&
    current.userId === input.userId &&
    current.status === SESSION_STATUS_ACTIVE &&
    Number.isFinite(openedAt) &&
    typeof current.createdAt === 'number' &&
    Number.isFinite(current.createdAt) &&
    current.createdAt >= openedAt;

  if (!reauthenticated) return refuse('fresh_authentication', 0);

  const sweep = await revokeEveryOtherSession(identity, input.userId, input.currentSessionId);
  const sessionsEnded = sweep.ended.length + sweep.alreadyGone.length;
  if (sweep.failed.length > 0 || sweep.incomplete) {
    return refuse('other_sessions_ended', sessionsEnded);
  }

  const cleared = await db.query<{
    id: string;
    resolved_at: string | Date;
    password_reset_required: boolean;
  }>(
    `update public.account_compromise_responses
        set resolved_at = now(), password_reset_required = false
      where id = $1 and user_id = $2 and resolved_at is null
      returning id, resolved_at, password_reset_required`,
    [input.responseId, input.userId],
  );
  if (Array.isArray(cleared) && cleared.length === 0) {
    const stored = await db.query<{
      id: string;
      resolved_at: string | Date;
      password_reset_required: boolean;
    }>(
      `select id, resolved_at, password_reset_required
         from public.account_compromise_responses
        where id = $1 and user_id = $2`,
      [input.responseId, input.userId],
    );
    if (confirmsCompromiseResolution(stored, input.responseId)) {
      return { ...base, status: 'already_resolved', outstanding: [], sessionsEnded };
    }
  }
  if (!confirmsCompromiseResolution(cleared, input.responseId)) {
    throw createError
      .serviceUnavailable(
        'Could not confirm that this response was resolved. Some sessions may already have been signed out.',
      )
      .asUserSafe();
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
