import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { z } from 'zod';
import {
  BankAccountsItemIdSchema,
  BankAccountsItemUpdateRequestSchema,
  type BankAccountsItemRemoveResponseSchema,
  type BankAccountsItemUpdateResponseSchema,
} from '@agiworkforce/cloud-contracts';

import { removeBankItem, setBankItemExcludedAccounts } from '@/lib/connectors/bank-accounts';
import { BANK_ACCOUNTS_CONNECTOR_ID } from '@/lib/connectors/plaid-config';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getUserScopedDb } from '@/lib/server/rls-db';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

interface RouteContext {
  params: Promise<{ itemId: string }>;
}

async function readItemId(context: RouteContext): Promise<string> {
  const parsed = BankAccountsItemIdSchema.safeParse((await context.params).itemId);
  if (!parsed.success) throw createError.notFound('That bank link was not found.').asUserSafe();
  return parsed.data;
}

async function handlePatch(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const limited = await withRateLimit(request, 'chat-conversation');
  if (limited) return limited;
  const { userId, organizationId } = await getUserScopedDb(request);
  const csrf = await requireCsrfToken(request, userId);
  if (csrf) return csrf as NextResponse;
  const itemId = await readItemId(context);
  const parsed = BankAccountsItemUpdateRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) throw createError.validation('Choose which accounts to include.');
  const outcome = await setBankItemExcludedAccounts(userId, itemId, parsed.data.excludedAccountIds);
  if (outcome === 'not_found') {
    throw createError.notFound('That bank link was not found.').asUserSafe();
  }
  if (outcome === 'unknown_account') {
    throw createError.validation('Choose accounts from this bank.').asUserSafe();
  }
  await recordAuditEvent({
    userId,
    organizationId,
    eventType: 'connector_setting_changed',
    request,
    detail: {
      resourceType: 'connector',
      connectorId: BANK_ACCOUNTS_CONNECTOR_ID,
      resourceId: itemId,
    },
  });
  const body: z.infer<typeof BankAccountsItemUpdateResponseSchema> = { updated: true };
  return NextResponse.json(body, { headers: NO_STORE });
}

async function handleDelete(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const limited = await withRateLimit(request, 'chat-conversation');
  if (limited) return limited;
  const { userId, organizationId } = await getUserScopedDb(request);
  const csrf = await requireCsrfToken(request, userId);
  if (csrf) return csrf as NextResponse;
  const itemId = await readItemId(context);
  if (!(await removeBankItem(userId, itemId))) {
    throw createError.notFound('That bank link was not found.').asUserSafe();
  }
  await recordAuditEvent({
    userId,
    organizationId,
    eventType: 'connector_removed',
    request,
    detail: {
      resourceType: 'connector',
      connectorId: BANK_ACCOUNTS_CONNECTOR_ID,
      resourceId: itemId,
    },
  });
  const body: z.infer<typeof BankAccountsItemRemoveResponseSchema> = { removed: true };
  return NextResponse.json(body, { headers: NO_STORE });
}

export const PATCH = withErrorHandler(handlePatch);
export const DELETE = withErrorHandler(handleDelete);
