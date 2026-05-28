import 'server-only';

import { createHash } from 'crypto';

export interface WaitlistEmailStorageKey {
  emailHash: string;
  emailPrefix: string;
  normalizedEmail: string;
}

export function normalizeWaitlistEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function hashEmailForWaitlistStorage(email: string): WaitlistEmailStorageKey {
  const normalizedEmail = normalizeWaitlistEmail(email);
  const emailHash = createHash('sha256').update(normalizedEmail).digest('hex');
  const localPart = normalizedEmail.split('@')[0] ?? normalizedEmail;
  return {
    emailHash,
    emailPrefix: localPart.slice(0, 3),
    normalizedEmail,
  };
}
