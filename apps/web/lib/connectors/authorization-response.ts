import 'server-only';

import {
  IssuerMismatchError,
  validateAuthorizationResponseIssuer,
  type OAuthDiscoveryState,
} from '@modelcontextprotocol/client';

import type { PendingAuthorization } from '@/lib/connectors/oauth-store';

export function authorizationResponseIssuerMatches(
  pending: PendingAuthorization,
  iss: string | undefined,
): boolean {
  const metadata = (pending.discoveryState as OAuthDiscoveryState | null | undefined)
    ?.authorizationServerMetadata;
  const expectedIssuer = metadata?.issuer ?? pending.issuer ?? undefined;
  try {
    validateAuthorizationResponseIssuer({
      iss,
      expectedIssuer,
      issParameterSupported: metadata?.authorization_response_iss_parameter_supported === true,
    });
    return true;
  } catch (error) {
    if (error instanceof IssuerMismatchError) return false;
    throw error;
  }
}
