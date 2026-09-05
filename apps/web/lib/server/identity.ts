import {
  resolveIdentityProvider,
  type IdentityClaims,
  type IdentityProvider,
  type IdentityRequestAuth,
  type IdentityUser,
} from '@agiworkforce/identity';
import type { NextRequest } from 'next/server';

/**
 * The port leaves the request type open so it carries no framework dependency.
 * This app is the host, so this is where it is pinned to the web request.
 */
export type WebIdentityProvider = IdentityProvider<NextRequest>;

/**
 * The one place this app chooses an identity provider. Every consumer takes the
 * port from here, so swapping the provider is an environment change plus one
 * adapter rather than an edit at each call site, and a single process holds one
 * client.
 */
let provider: WebIdentityProvider | null = null;

export function getIdentityProvider(): WebIdentityProvider {
  provider ??= resolveIdentityProvider<NextRequest>();
  return provider;
}

export function getIdentityAuthorizedParties(): readonly string[] {
  return getIdentityProvider().authorizedParties();
}

export function getRequestIdentity(): Promise<IdentityRequestAuth> {
  return getIdentityProvider().currentRequestAuth();
}

/**
 * Verification always carries the authorized-party allowlist, so no call site
 * can reach the provider without it and accept a token minted for another
 * origin.
 */
export function verifyIdentitySessionToken(token: string): Promise<IdentityClaims | null> {
  const identity = getIdentityProvider();
  return identity.verifySessionToken(token, {
    authorizedParties: identity.authorizedParties(),
  });
}

export function getIdentityUser(userId: string): Promise<IdentityUser | null> {
  return getIdentityProvider().getUser(userId);
}
