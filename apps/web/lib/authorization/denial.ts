import 'server-only';

import {
  ENTERPRISE_DENIAL_CODES,
  type EnterpriseDenial,
  type EnterpriseDenialCode,
} from '@agiworkforce/types';
import { AppError, ErrorCode } from '@/lib/errors';

const DENIAL_STATUS: Readonly<Record<EnterpriseDenialCode, number>> = Object.freeze({
  not_a_member: 403,
  plan_does_not_include: 403,
  permission_denied: 403,
  primary_owner_only: 403,
  policy_denied: 403,
  feature_disabled: 403,
  surface_not_allowed: 403,
  region_not_allowed: 403,
  reasoning_effort_capped: 403,
  rollout_withheld: 403,
  self_escalation_denied: 403,
  policy_unavailable: 503,
});

export class EnterpriseDenialError extends AppError {
  constructor(public readonly denial: EnterpriseDenial) {
    super(
      denial.code === 'policy_unavailable' ? ErrorCode.SERVICE_UNAVAILABLE : ErrorCode.FORBIDDEN,
      denial.message,
      DENIAL_STATUS[denial.code],
      {
        code: denial.code,
        stage: denial.stage,
        organizationId: denial.organizationId,
        policyRevision: denial.policyRevision,
        ...(denial.requiredPermission ? { requiredPermission: denial.requiredPermission } : {}),
        ...(denial.feature ? { feature: denial.feature } : {}),
        ...(denial.surface ? { surface: denial.surface } : {}),
        ...(denial.blockingRule ? { blockingRule: denial.blockingRule } : {}),
      },
    );
    this.name = 'EnterpriseDenialError';
    Object.setPrototypeOf(this, EnterpriseDenialError.prototype);
    this.asUserSafe();
  }
}

export function isEnterpriseDenialError(error: unknown): error is EnterpriseDenialError {
  return error instanceof EnterpriseDenialError;
}

export function isEnterpriseDenialCode(value: unknown): value is EnterpriseDenialCode {
  return (
    typeof value === 'string' && (ENTERPRISE_DENIAL_CODES as readonly string[]).includes(value)
  );
}
