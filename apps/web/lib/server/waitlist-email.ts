import 'server-only';

import { pseudonymizeEmail } from '@/lib/server/email-pseudonym';

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
  const emailHash = pseudonymizeEmail(normalizedEmail);
  const localPart = normalizedEmail.split('@')[0] ?? normalizedEmail;
  return {
    emailHash,
    emailPrefix: localPart.slice(0, 3),
    normalizedEmail,
  };
}
