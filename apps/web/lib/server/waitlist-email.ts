import 'server-only';

export function normalizeWaitlistEmail(email: string): string {
  return email.toLowerCase().trim();
}
