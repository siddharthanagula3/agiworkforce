import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BankAccountsItemUpdateRequestSchema } from '@agiworkforce/cloud-contracts';

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
const ItemIdSchema = z.string().uuid();

interface RouteContext {
  params: Promise<{ itemId: string }>;
}

async function readItemId(context: RouteContext): Promise<string> {
  const parsed = ItemIdSchema.safeParse((await context.params).itemId);
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
  if (!(await setBankItemExcludedAccounts(userId, itemId, parsed.data.excludedAccountIds))) {
    throw createError.notFound('That bank link was not found.').asUserSafe();
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
  return NextResponse.json({ updated: true }, { headers: NO_STORE });
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
  return NextResponse.json({ removed: true }, { headers: NO_STORE });
}

export const PATCH = withErrorHandler(handlePatch);
export const DELETE = withErrorHandler(handleDelete);
