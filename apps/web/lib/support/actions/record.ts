/**
 * @file THE single call site for recording a support-action attempt.
 *
 * Called on EVERY propose and EVERY confirm — success, failure and denial —
 * before the caller returns. Nothing else in this subtree writes audit data, so
 * when the concurrent audit-logging workflow lands its own service this file is
 * the one place that changes.
 *
 * AUDIT-DEP (dependency on the concurrent audit workflow, not owned here):
 *   `AuditEventType` has no value meaning "the support agent proposed an
 *   action" or "the support agent was denied an action". Requested additions:
 *     - support_action_proposed
 *     - support_action_denied
 *   Until they exist, an attempt rides the nearest existing BUSINESS event type
 *   with `outcome: 'denied' | 'failure' | 'success'` and
 *   `detail.source = 'support_agent'`. That is honest but coarse: "the agent
 *   tried to do something it was not allowed to do" is not directly queryable.
 *   We do NOT invent an event type and we do NOT edit lib/security-audit.ts.
 *
 * Every field passed below is inside `AuditEventDetail`'s allowlist, so
 * `sanitizeAuditDetail` keeps all of it and no schema change is needed.
 */

import 'server-only';

import { logger } from '@/lib/logger';
import { recordAuditEvent, type AuditOutcome } from '@/lib/security-audit';
import { SUPPORT_ACTIONS } from './registry';
import type { SupportActionId, SupportActionSurface } from './types';

export type SupportActionPhase = 'propose' | 'confirm';

export interface SupportActionAttempt {
  userId: string;
  actionId: SupportActionId;
  phase: SupportActionPhase;
  outcome: AuditOutcome;
  /** Null when the refusal happened before a proposal row existed. */
  proposalId: string | null;
  surface: SupportActionSurface;
  request?: Request;
  /** Short machine reason for a denial/failure. Never free text from a model. */
  reason?: string;
}

/**
 * A refusal for something that is NOT a registry action — an excluded
 * (destructive) id, or an id that does not exist at all.
 *
 * These have no `AuditEventType` that could honestly describe them, and
 * inventing one is not this workflow's call (see AUDIT-DEP above), so they are
 * recorded as a structured log line only. `requestedActionId` is echoed back
 * because it may have come from a model; it is a short bounded string that the
 * route already length-capped, and it never reaches the database.
 */
export function recordSupportActionRefusal(refusal: {
  userId: string;
  requestedActionId: string;
  reason: 'excluded' | 'unknown_action';
  surface: SupportActionSurface;
}): void {
  logger.warn(
    {
      event: 'support_action_refused',
      userId: refusal.userId,
      requestedActionId: refusal.requestedActionId.slice(0, 64),
      reason: refusal.reason,
      surface: refusal.surface,
    },
    'Support action refused before any proposal was created',
  );
}

export async function recordSupportActionAttempt(attempt: SupportActionAttempt): Promise<void> {
  const definition = SUPPORT_ACTIONS[attempt.actionId];
  const eventType =
    attempt.phase === 'propose'
      ? definition.audit.proposeEventType
      : definition.audit.executeEventType;

  try {
    await recordAuditEvent({
      userId: attempt.userId,
      eventType,
      outcome: attempt.outcome,
      severity: attempt.outcome === 'success' ? 'info' : 'warning',
      ...(attempt.request ? { request: attempt.request } : {}),
      surface: attempt.surface === 'marketing' ? 'web-marketing' : 'web',
      detail: {
        resourceType: definition.audit.resourceType,
        // The proposal id, NOT the target. Correlates propose with confirm
        // without recording what was acted on beyond the action's own type.
        ...(attempt.proposalId ? { resourceId: attempt.proposalId } : {}),
        source: 'support_agent',
        status: attempt.phase,
        ...(attempt.reason ? { reason: attempt.reason } : {}),
      },
    });
  } catch (error) {
    // An audit write failure must not turn a completed action into an error the
    // user sees, but it must never be silent either.
    logger.error(
      { error, userId: attempt.userId, actionId: attempt.actionId, phase: attempt.phase },
      'Failed to record support action attempt',
    );
  }

  // Structured log alongside the audit row: the audit vocabulary cannot yet
  // express "support agent attempt" (see AUDIT-DEP above), so this is the only
  // signal that is unambiguous today.
  logger.info(
    {
      event: 'support_action_attempt',
      userId: attempt.userId,
      actionId: attempt.actionId,
      phase: attempt.phase,
      outcome: attempt.outcome,
      proposalId: attempt.proposalId,
      surface: attempt.surface,
      reason: attempt.reason,
    },
    'Support action attempt',
  );
}
