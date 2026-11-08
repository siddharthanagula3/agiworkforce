import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_SCHEDULE_PATH } from '@agiworkforce/cloud-contracts';
import {
  handleAccountDeletionCancellation,
  accountDeletionCancellationOptions,
} from '@/lib/server/account-deletion-cancellation';

export const runtime = 'nodejs';

export async function PUT(request: NextRequest) {
  if (new URL(request.url).pathname !== MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_SCHEDULE_PATH) {
    return new NextResponse(null, { status: 404 });
  }
  return handleAccountDeletionCancellation(request, { kind: 'required-pair' });
}

export const OPTIONS = accountDeletionCancellationOptions;
