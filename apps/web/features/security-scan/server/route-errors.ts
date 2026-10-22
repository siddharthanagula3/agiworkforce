import 'server-only';

import { createError } from '@/lib/errors';
import { rethrowCloudCodeError } from '@/lib/services/cloud-code-session-errors';

import { SecurityScanBudgetError, SecurityScanNoRouteError } from './model';
import { SecurityScanSigningUnavailableError } from './report-signing';
import { SecurityScanScopeError } from './selection';

export function rethrowSecurityScanError(error: unknown): never {
  if (error instanceof SecurityScanScopeError) throw createError.validation(error.message);
  if (error instanceof SecurityScanBudgetError) throw createError.paymentRequired(error.message);
  if (error instanceof SecurityScanNoRouteError) {
    throw createError.capabilityUnavailable(error.message);
  }
  if (error instanceof SecurityScanSigningUnavailableError) {
    throw createError.serviceUnavailable(error.message);
  }
  rethrowCloudCodeError(error);
}
