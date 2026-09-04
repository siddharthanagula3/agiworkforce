import 'server-only';

import type { CloudCodeNetworkAccess } from '@agiworkforce/types';
import {
  harnessCredentialSpecs,
  harnessIsProxyCovered,
  harnessNeedsUserCredential,
} from './templates';

export const NETWORK_ACCESS_REQUIRES_PROXY_CODE = 'network_access_requires_proxy';
export const HARNESS_CREDENTIAL_UNAVAILABLE_CODE = 'harness_credential_unavailable';

const FULL_NETWORK: CloudCodeNetworkAccess = 'full';

export function managedCredentialWouldEnterSandbox(
  runtimeId: string | null | undefined,
  explicitCredentialProvided = false,
): boolean {
  if (explicitCredentialProvided || !runtimeId) return false;
  if (harnessCredentialSpecs(runtimeId).length === 0) return false;
  return !harnessIsProxyCovered(runtimeId);
}

export function egressNeedsProxy(
  networkAccess: CloudCodeNetworkAccess,
  runtimeId: string | null | undefined,
  explicitCredentialProvided = false,
  extraHostCount = 0,
): boolean {
  if (networkAccess !== FULL_NETWORK && extraHostCount <= 0) return false;
  return managedCredentialWouldEnterSandbox(runtimeId, explicitCredentialProvided);
}

export function fullNetworkNeedsProxy(
  networkAccess: CloudCodeNetworkAccess,
  runtimeId: string | null | undefined,
  explicitCredentialProvided = false,
): boolean {
  return egressNeedsProxy(networkAccess, runtimeId, explicitCredentialProvided, 0);
}

export function harnessCredentialIsAvailable(
  runtimeId: string | null | undefined,
  explicitCredentialProvided = false,
): boolean {
  if (explicitCredentialProvided || !runtimeId) return true;
  return !harnessNeedsUserCredential(runtimeId);
}
