import 'server-only';

import type { NextRequest } from 'next/server';

import { verifyDeveloperTokenSignature } from '@/lib/server/developer-token';
import { getRequestIdentity, verifyIdentitySessionToken } from '@/lib/server/identity';

export interface DeviceCredentialLink {
  credentialFamilyId: string | null;
  identitySessionId: string | null;
}

const NO_LINK: DeviceCredentialLink = { credentialFamilyId: null, identitySessionId: null };

export async function resolveDeviceCredentialLink(
  request: NextRequest,
  userId: string,
): Promise<DeviceCredentialLink> {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (token.startsWith('sk_live_') || token.startsWith('sk_test_')) return NO_LINK;

    const developer = verifyDeveloperTokenSignature(token);
    if (developer) {
      return developer.userId === userId
        ? { credentialFamilyId: developer.sessionFamilyId ?? null, identitySessionId: null }
        : NO_LINK;
    }

    try {
      const claims = await verifyIdentitySessionToken(token);
      return claims?.sessionId
        ? { credentialFamilyId: null, identitySessionId: claims.sessionId }
        : NO_LINK;
    } catch {
      return NO_LINK;
    }
  }

  try {
    const { sessionId } = await getRequestIdentity();
    return { credentialFamilyId: null, identitySessionId: sessionId ?? null };
  } catch {
    return NO_LINK;
  }
}
