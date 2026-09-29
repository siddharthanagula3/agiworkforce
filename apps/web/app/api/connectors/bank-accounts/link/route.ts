import 'server-only';

import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import { NextRequest, NextResponse } from 'next/server';

import {
  BankAccountsLinkRequestSchema,
  type BankAccountsLinkResponse,
} from '@agiworkforce/cloud-contracts';
import {
  bankAccountsUnavailableReason,
  createBankAccountsHostedLink,
  createBankAccountsLinkToken,
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

  const body = await request.json().catch(() => ({}));
  const parsed = BankAccountsLinkRequestSchema.safeParse(body ?? {});
  if (!parsed.success) throw createError.validation('Unknown bank link option');
  const link: BankAccountsLinkResponse = parsed.data.hostedLink
    ? await createBankAccountsHostedLink(userId)
    : await createBankAccountsLinkToken(userId);
  await recordAuditEvent({
    userId,
    organizationId,
    eventType: 'connector_authorization_started',
    request,
    detail: {
      resourceType: 'connector',
      connectorId: BANK_ACCOUNTS_CONNECTOR_ID,
      source: parsed.data.hostedLink ? 'plaid_hosted_link' : 'plaid',
    },
  });
  return NextResponse.json(link, { headers: { 'Cache-Control': 'private, no-store' } });
}

export const POST = withCorsRoute(withErrorHandler(handlePost));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
