import 'server-only';

import type { NextRequest } from 'next/server';
import {
  handleAccountDeletionCancellation,
  accountDeletionCancellationOptions,
} from '@/lib/server/account-deletion-cancellation';

export const runtime = 'nodejs';

export async function PUT(request: NextRequest) {
  return handleAccountDeletionCancellation(request, { kind: 'required-pair' });
}

export const OPTIONS = accountDeletionCancellationOptions;
