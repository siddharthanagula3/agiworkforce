import 'server-only';

import { createError } from '@/lib/errors';

export const AUTHENTICATOR_ENROLLMENT_ENV_VAR = 'AGI_AUTHENTICATOR_ENROLLMENT';

export const AUTHENTICATOR_UNAVAILABLE_MESSAGE =
  'Authenticator apps and backup codes are temporarily unavailable.';

export function authenticatorEnrollmentAvailable(): boolean {
  return process.env[AUTHENTICATOR_ENROLLMENT_ENV_VAR] === '1';
}

export function requireAuthenticatorEnrollment(): void {
  if (!authenticatorEnrollmentAvailable()) {
    throw createError.capabilityUnavailable(AUTHENTICATOR_UNAVAILABLE_MESSAGE);
  }
}
