import 'server-only';

import type { NextRequest } from 'next/server';
import { AppError, ErrorCode, isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClientIp, recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { resolveIpAllowListPolicy } from '@/lib/services/organization-policy-gate';
import { isIpAllowed } from '@/lib/services/ip-allow-list';

const IP_NOT_ALLOWED_ERROR_REASON = 'ip_not_allowed';
const IP_NOT_ALLOWED_MESSAGE =
  'Your workspace has restricted access to a specific set of networks, and your current connection is not one of them. Connect from an allowed network or contact your administrator.';

export class IpNotAllowedError extends AppError {
  constructor(message: string = IP_NOT_ALLOWED_MESSAGE) {
    super(ErrorCode.IP_NOT_ALLOWED, message, 403, { reason: IP_NOT_ALLOWED_ERROR_REASON });
    this.name = 'IpNotAllowedError';
    Object.setPrototypeOf(this, IpNotAllowedError.prototype);
  }
}

export function isIpNotAllowedError(error: unknown): error is IpNotAllowedError {
  return (
    isAppError(error) &&
    (error.details as { reason?: unknown } | undefined)?.reason === IP_NOT_ALLOWED_ERROR_REASON
  );
}

export async function assertIpAllowList(userId: string, request: NextRequest): Promise<void> {
  const { cidrs, organizationId } = await resolveIpAllowListPolicy(getNeonDb(), userId, request);
  if (cidrs.length === 0 || !organizationId) return;

  const clientIp = getClientIp(request);
  if (isIpAllowed(clientIp, cidrs)) return;

  logger.warn(
    { userId, organizationId },
    '[ip-allow-list] request refused by workspace ip allow list',
  );

  await recordAuditEvent({
    userId,
    organizationId,
    eventType: 'ip_not_allowed',
    request,
    outcome: 'denied',
    severity: 'warning',
    detail: { resourceType: 'organization_ip_allow_list', status: 'denied' },
  });

  throw new IpNotAllowedError();
}
