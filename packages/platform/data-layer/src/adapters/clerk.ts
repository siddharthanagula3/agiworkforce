/**
 * @file adapters/clerk.ts
 * @module @agiworkforce/data-layer/adapters/clerk
 *
 * Clerk auth adapter.
 *
 * This adapter verifies Clerk session JWTs on the server. It intentionally
 * does not own sign-in/sign-up UI flows; those belong to the web/mobile
 * surfaces. It normalizes the verified Clerk `sub` claim to the repo's
 * vendor-neutral `VerifiedJwt.userId` contract.
 */

import { type AuthAdapter, type VerifiedJwt, DataLayerConfigError } from '../types';

type ClerkBackendModule = typeof import('@clerk/backend');
type VerifyTokenFn = ClerkBackendModule['verifyToken'];
type ClerkVerifyTokenOptions = Parameters<VerifyTokenFn>[1];

let _clerkBackend: ClerkBackendModule | null = null;

async function loadClerkBackend(): Promise<ClerkBackendModule> {
  if (_clerkBackend) return _clerkBackend;
  try {
    _clerkBackend = (await import('@clerk/backend')) as ClerkBackendModule;
    return _clerkBackend;
  } catch (e) {
    throw new DataLayerConfigError(
      'Tried to use the Clerk auth adapter but @clerk/backend is not installed. ' +
        'Run `pnpm add @clerk/backend` in the consuming app, or set AGI_AUTH_PROVIDER ' +
        `to a different provider. Underlying error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

export interface ClerkAuthConfig {
  secretKey?: string;
  jwtKey?: string;
  authorizedParties?: string[];
  verifyToken?: VerifyTokenFn;
}

export class ClerkAuthAdapter implements AuthAdapter {
  constructor(private config: ClerkAuthConfig) {
    if (!config.secretKey && !config.jwtKey && !config.verifyToken) {
      throw new DataLayerConfigError(
        'Clerk auth adapter requires CLERK_JWT_KEY for networkless verification ' +
          'or CLERK_SECRET_KEY for Clerk JWKS-backed verification.',
      );
    }
  }

  async verifyJwt(token: string): Promise<VerifiedJwt | null> {
    if (token.trim().length === 0) return null;

    const authorizedParties = (this.config.authorizedParties ?? [])
      .map((party) => party.trim())
      .filter(Boolean);
    // Clerk skips the azp check when authorizedParties is empty, which accepts
    // any same-instance token minted for another origin.
    if (authorizedParties.length === 0) {
      throw new DataLayerConfigError(
        'Clerk auth adapter refuses to verify session tokens without an authorized-party ' +
          'allowlist. Set CLERK_AUTHORIZED_PARTIES (or pass clerkAuthorizedParties) so Clerk ' +
          'enforces the token azp claim against this deployment origin.',
      );
    }

    const verifyToken = this.config.verifyToken ?? (await loadClerkBackend()).verifyToken;
    const options: ClerkVerifyTokenOptions = { authorizedParties };
    if (this.config.jwtKey) options.jwtKey = this.config.jwtKey;
    if (this.config.secretKey) options.secretKey = this.config.secretKey;

    try {
      const claims = await verifyToken(token, options);
      const raw = claims as Record<string, unknown>;
      const userId = raw['sub'];
      if (typeof userId !== 'string' || userId.length === 0) return null;

      const email = raw['email'];
      return {
        userId,
        ...(typeof email === 'string' && email.length > 0 ? { email } : null),
        raw,
      };
    } catch {
      return null;
    }
  }
}
