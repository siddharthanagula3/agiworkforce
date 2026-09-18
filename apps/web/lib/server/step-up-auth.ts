import 'server-only';

import { AppError, isAppError, type ErrorCodeValue } from '@/lib/errors';
import { recordAuditEvent } from '@/lib/security-audit';
import { stepUpActionSpec, type StepUpAction } from '@/lib/server/step-up/actions';
import {
  StepUpGrantInvalidError,
  verifyStepUpGrant,
  type StepUpGrantPayload,
} from '@/lib/server/step-up/grant-token';

export const STEP_UP_TOKEN_HEADER = 'x-step-up-token';
const STEP_UP_ERROR_CODE = 'STEP_UP_REQUIRED' as ErrorCodeValue;
const STEP_UP_ERROR_REASON = 'step_up_required';

export class StepUpRequiredError extends AppError {
  constructor(action: StepUpAction, cause: StepUpChallengeReason) {
    super(
      STEP_UP_ERROR_CODE,
      'Confirm it is you with a second factor before completing this action.',
      403,
      {
        reason: STEP_UP_ERROR_REASON,
        action,
        cause,
        consequence: stepUpActionSpec(action).consequence,
        freshnessSeconds: stepUpActionSpec(action).freshnessSeconds,
      },
    );
    this.name = 'StepUpRequiredError';
    Object.setPrototypeOf(this, StepUpRequiredError.prototype);
    this.asUserSafe();
  }
}

export type StepUpChallengeReason =
  'missing' | 'malformed' | 'signature' | 'expired' | 'subject_mismatch';

export function isStepUpRequiredError(error: unknown): error is StepUpRequiredError {
  return (
    isAppError(error) &&
    (error.details as { reason?: unknown } | undefined)?.reason === STEP_UP_ERROR_REASON
  );
}

export interface StepUpRequirement {
  userId: string;
  action: StepUpAction;
  /** Binds the proof to one target, so a grant for one workspace cannot move another. */
  resourceId?: string | null;
  organizationId?: string | null;
  request?: Request;
  endpoint?: string;
}

/**
 * Refuses the request unless the caller presents a proof of a second factor
 * verified within this action's freshness window. Every outcome is audited,
 * including the refusal, because a failed run at an irreversible action matters.
 */
export async function requireStepUp(requirement: StepUpRequirement): Promise<StepUpGrantPayload> {
  const {
    userId,
    action,
    resourceId = null,
    organizationId = null,
    request,
    endpoint,
  } = requirement;
  const token = request?.headers.get(STEP_UP_TOKEN_HEADER)?.trim();

  const refuse = async (cause: StepUpChallengeReason): Promise<never> => {
    await recordAuditEvent({
      userId,
      eventType: 'step_up_challenged',
      outcome: 'denied',
      severity: 'warning',
      request,
      endpoint,
      organizationId,
      detail: {
        resourceType: 'step_up',
        resourceId: action,
        reason: cause,
        ...(resourceId ? { scope: resourceId } : {}),
      },
    });
    throw new StepUpRequiredError(action, cause);
  };

  if (!token) return refuse('missing');

  let payload: StepUpGrantPayload;
  try {
    payload = verifyStepUpGrant(token, { userId, action, resourceId });
  } catch (error) {
    return refuse(error instanceof StepUpGrantInvalidError ? error.reason : 'malformed');
  }

  await recordAuditEvent({
    userId,
    eventType: 'step_up_satisfied',
    severity: 'info',
    request,
    endpoint,
    organizationId,
    detail: {
      resourceType: 'step_up',
      resourceId: action,
      source: payload.method,
      ...(resourceId ? { scope: resourceId } : {}),
    },
  });

  return payload;
}
