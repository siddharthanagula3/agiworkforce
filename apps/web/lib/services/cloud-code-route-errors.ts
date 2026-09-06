import 'server-only';

import { NextResponse } from 'next/server';
import {
  createManagedUsageErrorBody,
  type ManagedUsageRequestError,
} from './managed-usage-request-service';

const QUOTA_ERROR_STATUS = 402;

/**
 * A billing refusal is not a malformed request. Answering with the ledger's own
 * status and sentence is what lets the Code surface tell the reader what to do,
 * instead of the generic 400 every one of these used to collapse into.
 */
export function managedUsageErrorResponse(error: ManagedUsageRequestError): NextResponse {
  return NextResponse.json(
    createManagedUsageErrorBody(
      error,
      error.status === QUOTA_ERROR_STATUS ? 'insufficient_quota' : 'invalid_request_error',
    ),
    { status: error.status },
  );
}
