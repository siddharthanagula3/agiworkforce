import 'server-only';

import type { NextRequest } from 'next/server';
import { FreeOfferingRequestSchema } from '@agiworkforce/cloud-contracts';
import { withErrorHandler } from '@/lib/error-handler';
import { assertAccountActive } from '@/lib/api-auth';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import {
  refuseFreeQuotaKeptOutConversation,
  refuseUnsupportedFreeQuotaPrompt,
  serveFreeQuotaTurn,
} from '@/lib/server/free-quota-turn';
import { conversationKeepsOutOfTraining } from '@/lib/services/health-space-service';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function handlePost(request: NextRequest): Promise<Response> {
  const csrf = await requireCsrfToken(request);
  if (csrf) return csrf;
  const scoped = await getUserScopedDb(request);
  await assertAccountActive(scoped.userId);
  const limit = await withRateLimit(request, 'llm-completion', `user:${scoped.userId}`);
  if (limit) return limit;
  const parsed = FreeOfferingRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return refuseUnsupportedFreeQuotaPrompt();
  if (await conversationKeepsOutOfTraining(scoped.db, scoped.userId, parsed.data.conversation_id)) {
    return refuseFreeQuotaKeptOutConversation();
  }
  return serveFreeQuotaTurn(request, scoped, parsed.data);
}

export const POST = withErrorHandler(handlePost);
