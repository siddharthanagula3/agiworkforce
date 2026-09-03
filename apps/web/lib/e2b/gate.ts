import 'server-only';

import { isManagedComputePrivateBetaEnabled } from '@/lib/managed-compute-gate';
import { sandboxComputeIsPriceable } from '@/lib/e2b/compute-metering';

export const E2B_EXECUTION_ENV = 'AGI_E2B_EXECUTION';
export const E2B_API_KEY_ENV = 'E2B_API_KEY';

export function e2bExecutionEnabled(): boolean {
  const key = process.env[E2B_API_KEY_ENV];
  const hasKey = typeof key === 'string' && key.length > 0;
  const flagOn = process.env[E2B_EXECUTION_ENV] === '1';
  return hasKey || flagOn;
}

export function e2bCutoverEnabled(): boolean {
  return process.env[E2B_EXECUTION_ENV] === '1';
}

export function e2bProvisioningReady(): boolean {
  const key = process.env[E2B_API_KEY_ENV];
  return (
    e2bCutoverEnabled() &&
    typeof key === 'string' &&
    key.trim().length > 0 &&
    sandboxComputeIsPriceable()
  );
}

export function managedComputeBetaEnabled(): boolean {
  return isManagedComputePrivateBetaEnabled();
}
