import type { IdentityClaims } from '@agiworkforce/identity';
import { SURFACE_TOKEN_HEADER, type TemplateBoundSurface } from '@agiworkforce/types';

import { bindTemplateSurfaceFromClaims, carriesSurfaceClaim } from '@/lib/free-chat-surface-policy';
import { getIdentityProvider, verifyIdentitySessionToken } from '@/lib/server/identity';

const AUTHORIZED_PARTY_CLAIM = 'azp';

function carriesAuthorizedParty(claims: Readonly<Record<string, unknown>>): boolean {
  return AUTHORIZED_PARTY_CLAIM in claims;
}

export type NativeSessionRefusal =
  'surface_token_as_bearer' | 'native_session_without_surface_proof' | 'invalid_surface_token';

/**
 * `refusal` is null when the token is not a provider-signed, origin-less
 * session token at all (unverifiable, naming an authorized party, or carrying
 * no session id), which is an ordinary invalid bearer rather than a native
 * session that failed its binding.
 */
export type NativeSessionVerification =
  | { admitted: true; claims: IdentityClaims; boundSurface: TemplateBoundSurface }
  | { admitted: false; refusal: NativeSessionRefusal | null };

const NOT_A_NATIVE_SESSION: NativeSessionVerification = { admitted: false, refusal: null };

/**
 * A native app's session token has no origin, so the authorized-party check
 * that binds a browser token cannot bind it and the default verification
 * refuses it. It is admitted here only beside a surface proof the provider
 * signed for the same subject. Both tokens must be origin-less: a pair in
 * which either one names an authorized party is not what a native client
 * mints, and a token that names one belongs on the default path.
 */
export async function verifyNativeSessionToken(
  token: string,
  surfaceProof: string | null,
): Promise<NativeSessionVerification> {
  const identity = getIdentityProvider();
  const options = {
    authorizedParties: identity.authorizedParties(),
    admitMissingAuthorizedParty: true,
  };

  const claims = await identity.verifySessionToken(token, options);
  if (!claims || carriesAuthorizedParty(claims.raw)) return NOT_A_NATIVE_SESSION;
  if (carriesSurfaceClaim(claims.raw)) {
    return { admitted: false, refusal: 'surface_token_as_bearer' };
  }
  if (!claims.sessionId) return NOT_A_NATIVE_SESSION;
  if (surfaceProof === null) {
    return { admitted: false, refusal: 'native_session_without_surface_proof' };
  }

  const proof = await identity.verifySessionToken(surfaceProof, options);
  const boundSurface =
    proof && proof.subject === claims.subject && !carriesAuthorizedParty(proof.raw)
      ? bindTemplateSurfaceFromClaims(proof.raw)
      : null;
  return boundSurface
    ? { admitted: true, claims, boundSurface }
    : { admitted: false, refusal: 'invalid_surface_token' };
}

/**
 * For a caller that holds the request's surface proof. Without a proof this is
 * the default verification and nothing else, so a caller that cannot see the
 * header gains nothing by passing null.
 */
export async function verifySessionTokenWithSurfaceProof(
  token: string,
  surfaceProof: string | null,
): Promise<IdentityClaims | null> {
  const claims = await verifyIdentitySessionToken(token);
  if (claims || surfaceProof === null) return claims;
  const native = await verifyNativeSessionToken(token, surfaceProof);
  return native.admitted ? native.claims : null;
}

export function verifyRequestSessionToken(
  request: Request,
  token: string,
): Promise<IdentityClaims | null> {
  return verifySessionTokenWithSurfaceProof(token, request.headers.get(SURFACE_TOKEN_HEADER));
}
