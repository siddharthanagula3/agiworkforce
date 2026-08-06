/**
 * @file PKCE (RFC 7636) helpers for the connector OAuth broker.
 *
 * Wire-equivalent to `crates/agiworkforce-mcp/src/oauth/pkce.rs`: a 43-char
 * verifier over the PKCE unreserved alphabet (there, rejection-sampled; here,
 * base64url of 32 random bytes — same alphabet, same length, >=256 bits either
 * way) plus an S256 challenge. Kept in its own module so the verifier is never
 * constructed inline next to request handling, where it could end up in a log
 * line or a redirect.
 */

import 'server-only';

import { createHash, randomBytes } from 'crypto';

export interface PkcePair {
  verifier: string;
  challenge: string;
  method: 'S256';
}

export function generatePkcePair(): PkcePair {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge, method: 'S256' };
}

/** 32 random bytes as hex — the `state` parameter, and 64 hex chars when hashed. */
export function generateOAuthState(): string {
  return randomBytes(32).toString('hex');
}

/**
 * The value stored in `connector_oauth_authorizations.state_hash`.
 *
 * The state itself is never persisted: a read of that table must not yield
 * anything that can complete somebody else's in-flight authorization.
 */
export function hashOAuthState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

export const OAUTH_STATE_RE = /^[a-f0-9]{64}$/;
