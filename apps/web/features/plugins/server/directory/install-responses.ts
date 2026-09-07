import { NextResponse } from 'next/server';

import { AppError, createError } from '@/lib/errors';
import { INSTALLS_DISABLED_MESSAGE, MARKETPLACE_UNAVAILABLE_MESSAGE } from './constants';

const INSTALLS_DISABLED_CODE = 'PLUGIN_INSTALLS_DISABLED';
const INSTALLS_DISABLED_STATUS = 503;

export function installsDisabledResponse(): NextResponse {
  return NextResponse.json(
    { error: { code: INSTALLS_DISABLED_CODE, message: INSTALLS_DISABLED_MESSAGE } },
    { status: INSTALLS_DISABLED_STATUS },
  );
}

export function marketplaceUnavailableError(): AppError {
  return createError.capabilityUnavailable(MARKETPLACE_UNAVAILABLE_MESSAGE);
}
