
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
  proposalId: string | null;
  surface: SupportActionSurface;
  request?: Request;
  reason?: string;
}

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
        ...(attempt.proposalId ? { resourceId: attempt.proposalId } : {}),
        source: 'support_agent',
        status: attempt.phase,
        ...(attempt.reason ? { reason: attempt.reason } : {}),
      },
    });
  } catch (error) {
    logger.error(
      { error, userId: attempt.userId, actionId: attempt.actionId, phase: attempt.phase },
      'Failed to record support action attempt',
    );
  }

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
