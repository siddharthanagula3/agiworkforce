import 'server-only';

import { NextResponse } from 'next/server';
import { handleError } from '@/lib/error-handler';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { isPasskeyRequiredError } from '@/lib/server/account-security/gate';
import { isAccountUnavailableError } from '@/lib/api-auth';

const GENERIC_UNAUTHORIZED_MESSAGE = 'Authentication required';
const GENERIC_UNAUTHORIZED_STATUS = 401;

export function isAuthGateRefusal(error: unknown): boolean {
  return (
    isMfaRequiredError(error) ||
    isIpNotAllowedError(error) ||
    isPasskeyRequiredError(error) ||
    isAccountUnavailableError(error)
  );
}

export function unauthorizedResponseFor(error: unknown): NextResponse {
  if (isAuthGateRefusal(error)) return handleError(error);
  return NextResponse.json(
    { error: GENERIC_UNAUTHORIZED_MESSAGE },
    { status: GENERIC_UNAUTHORIZED_STATUS },
  );
}
