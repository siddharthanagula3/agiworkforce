import 'server-only';

import type { NextRequest } from 'next/server';
import { handleAccountDeletionCancellation, accountDeletionCancellationOptions } from '@/lib/server/account-deletion-cancellation';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  return handleAccountDeletionCancellation(request, { kind: 'legacy' });
}

export const OPTIONS = accountDeletionCancellationOptions;
