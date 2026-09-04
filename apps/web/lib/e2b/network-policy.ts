import 'server-only';

import type { CloudCodeNetworkAccess } from '@agiworkforce/types';
import { harnessCredentialSpecs, harnessIsProxyCovered } from './templates';

export const NETWORK_ACCESS_REQUIRES_PROXY_CODE = 'network_access_requires_proxy';

export function fullNetworkNeedsProxy(
  networkAccess: CloudCodeNetworkAccess,
  runtimeId: string | null | undefined,
  explicitCredentialProvided = false,
): boolean {
  if (networkAccess !== 'full' || explicitCredentialProvided || !runtimeId) return false;
  if (harnessCredentialSpecs(runtimeId).length === 0) return false;
  return !harnessIsProxyCovered(runtimeId);
}
