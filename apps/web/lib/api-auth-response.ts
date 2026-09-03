import 'server-only';

import { NextResponse } from 'next/server';
import { handleError } from '@/lib/error-handler';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';

const GENERIC_UNAUTHORIZED_MESSAGE = 'Authentication required';
const GENERIC_UNAUTHORIZED_STATUS = 401;

export function unauthorizedResponseFor(error: unknown): NextResponse {
  if (isMfaRequiredError(error) || isIpNotAllowedError(error)) {
    return handleError(error);
  }
  return NextResponse.json(
    { error: GENERIC_UNAUTHORIZED_MESSAGE },
    { status: GENERIC_UNAUTHORIZED_STATUS },
  );
}
