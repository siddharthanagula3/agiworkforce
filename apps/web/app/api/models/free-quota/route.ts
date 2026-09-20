import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getClerkAuthUser, assertAccountActive } from '@/lib/api-auth';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { buildFreeQuotaCatalogue, isLocalQuotaRequest } from '@/lib/server/free-quota-catalogue';
import {
  readLocalQuotaVerification,
  PolicySchema,
  validateQuotaProbeAuthorization,
  hasExhaustedFreeQuota,
  quotaCredentialMatches,
} from '@/lib/free-quota-authorization';
import freePools from '@/config/free-pools.json';

export const runtime = 'nodejs';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  if (!isLocalQuotaRequest(request.url, process.env.NODE_ENV)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  const rateLimitResponse = await withRateLimit(request, 'model-catalog');
  if (rateLimitResponse) return rateLimitResponse;
  const { userId } = await getClerkAuthUser(request);
  await assertAccountActive(userId);
  const catalogue = buildFreeQuotaCatalogue();
  const verification = await readLocalQuotaVerification().catch(() => null);
  if (
    catalogue &&
    verification?.localUserId === userId &&
    quotaCredentialMatches(verification, process.env['QWEN_API_KEY'] ?? '')
  ) {
    const policy = PolicySchema.parse(freePools.quotaExperimentPolicy);
    for (const model of catalogue.models) {
      if (model.status !== 'account_check_required') continue;
      if (await hasExhaustedFreeQuota(verification, model.key)) {
        model.status = 'exhausted';
        continue;
      }
      try {
        validateQuotaProbeAuthorization(
          verification,
          process.env['QWEN_API_KEY'] ?? '',
          model.key,
          policy,
        );
        model.status = 'ready';
      } catch {
        // Stale or insufficient evidence never makes a model ready to send.
      }
    }
  }
  return NextResponse.json(catalogue, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export const GET = withErrorHandler(handleGet);
