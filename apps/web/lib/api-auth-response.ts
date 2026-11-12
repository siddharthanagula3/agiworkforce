import 'server-only';

import { NextResponse } from 'next/server';
import { handleError } from '@/lib/error-handler';
import { isAppError } from '@/lib/errors';

const GENERIC_UNAUTHORIZED_MESSAGE = 'Authentication required';
const GENERIC_UNAUTHORIZED_STATUS = 401;

/**
 * A refusal the caller must see as it is, rather than as a sign-in prompt: an
 * account gate, a lockdown, a scope denial, or a dependency that could not
 * answer. Only a 401 means the credential itself was missing or invalid, and a
 * client that signs out on anything else signs the user out during an outage.
 */
export function isAuthGateRefusal(error: unknown): boolean {
  return isAppError(error) && error.statusCode !== GENERIC_UNAUTHORIZED_STATUS;
}

export function unauthorizedResponseFor(error: unknown): NextResponse {
  if (isAuthGateRefusal(error)) return handleError(error);
  return NextResponse.json(
    { error: GENERIC_UNAUTHORIZED_MESSAGE },
    { status: GENERIC_UNAUTHORIZED_STATUS },
  );
}
