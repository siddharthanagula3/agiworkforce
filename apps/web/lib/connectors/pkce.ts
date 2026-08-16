
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

export function generateOAuthState(): string {
  return randomBytes(32).toString('hex');
}

export function hashOAuthState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

export const OAUTH_STATE_RE = /^[a-f0-9]{64}$/;
