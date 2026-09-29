import 'server-only';

import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import { NextRequest, NextResponse } from 'next/server';
import type { z } from 'zod';
import {
  BankAccountsExchangeRequestSchema,
  type BankAccountsExchangeResponseSchema,
} from '@agiworkforce/cloud-contracts';

import {
  bankAccountsUnavailableReason,
  completeBankAccountsHostedLink,
  connectBankAccounts,
} from '@/lib/connectors/bank-accounts';
import { BANK_ACCOUNTS_CONNECTOR_ID } from '@/lib/connectors/plaid-config';
import { sensitiveDataRegionRefusal } from '@/lib/connectors/sensitive-data-connectors';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { evaluateConnectorPolicyForUser } from '@/lib/services/connector-policy-gate';

export const runtime = 'nodejs';

const RATE_LIMIT_BUCKET = 'chat-conversation';

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;
  const limited = await withRateLimit(request, RATE_LIMIT_BUCKET);
  if (limited) return limited;

  const { db, userId, organizationId } = await getUserScopedDb(request);

  const unavailable = bankAccountsUnavailableReason();
  if (unavailable) throw createError.capabilityUnavailable(unavailable);
  const regionRefusal = sensitiveDataRegionRefusal(BANK_ACCOUNTS_CONNECTOR_ID, request);
  if (regionRefusal) throw createError.forbidden(regionRefusal).asUserSafe();
  const policy = await evaluateConnectorPolicyForUser({
    db,
    userId,
    organizationId,
    connectorId: BANK_ACCOUNTS_CONNECTOR_ID,
    request,
    surface: resolveCloudChatSurface(request),
  });
  if (!policy.allowed) throw createError.forbidden(policy.reason).asUserSafe();

  const parsed = BankAccountsExchangeRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) throw createError.validation('publicToken or linkToken is required');

  if ('linkToken' in parsed.data) {
    const outcome = await completeBankAccountsHostedLink(userId, parsed.data.linkToken);
    if (outcome === 'not_finished') {
      throw createError
        .conflict('The bank link was not finished. Start linking again.')
        .asUserSafe();
    }
    if (outcome === 'not_found') {
      throw createError.notFound('This bank link has expired. Start linking again.').asUserSafe();
    }
  } else {
    await connectBankAccounts(userId, parsed.data.publicToken, parsed.data.institutionName ?? null);
  }
  await recordAuditEvent({
    userId,
    eventType: 'connector_added',
    request,
    detail: { resourceType: 'connector', connectorId: BANK_ACCOUNTS_CONNECTOR_ID, source: 'plaid' },
  });

  const body: z.infer<typeof BankAccountsExchangeResponseSchema> = {
    connector: { connectorId: BANK_ACCOUNTS_CONNECTOR_ID, connectedAt: new Date().toISOString() },
  };
  return NextResponse.json(body, {
    status: 201,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export const POST = withCorsRoute(withErrorHandler(handlePost));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
