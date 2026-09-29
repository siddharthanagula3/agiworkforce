import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { z } from 'zod';
import type { BankAccountsItemsResponseSchema } from '@agiworkforce/cloud-contracts';

import { bankAccountsUnavailableReason, listBankItems } from '@/lib/connectors/bank-accounts';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';

export const runtime = 'nodejs';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const limited = await withRateLimit(request, 'chat-conversation');
  if (limited) return limited;
  const { userId } = await getUserScopedDb(request);
  const body: z.infer<typeof BankAccountsItemsResponseSchema> = {
    items: bankAccountsUnavailableReason() ? [] : await listBankItems(userId),
  };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const GET = withErrorHandler(handleGet);
