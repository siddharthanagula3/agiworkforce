import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import { classifyTaskLocally } from '@agiworkforce/routing';
import { getSlotForModel, isFlagshipRoutingSlot } from '@agiworkforce/types';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { accountAccessDecision } from '@/lib/auth/account-status';
import { readAccountStatus } from '@/lib/auth/account-lifecycle';
import { assertCapabilityAvailable } from '@/lib/feature-flags/capability-gate';
import { buildFlagSubject } from '@/lib/feature-flags/flag-evaluation-service';
import { logger } from '@/lib/logger';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { getNeonDb } from '@/lib/server/neon-db';
import { mustAcceptTerms } from '@/lib/server/terms';
import { resolveEntitlementBundle } from '@/lib/services/entitlement-resolution';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { evaluateManagedComputeAccess } from '@/lib/services/managed-compute-access';
import {
  finalizeManagedUsageRequest,
  fingerprintManagedUsageRequest,
  markManagedUsageProviderStarted,
  reserveManagedUsageRequest,
} from '@/lib/services/managed-usage-request-service';
import {
  MAX_OUTPUT_TOKENS,
  runScheduledCompletion,
  selectUnattendedRoute,
} from '@/lib/services/scheduled-agent-executor';

const TOKEN_PREFIX = 'agi_it_';
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^agi_it_[A-Za-z0-9_-]{43}$/;
const TITLE_MAX_CHARS = 60;
const ASK_DIRECTIVE =
  'The person asked this through Siri and will hear the answer spoken. Answer in plain sentences without markdown, lists, tables, links or code, in at most a few short paragraphs.';

export const MOBILE_INTENT_SIGN_IN_MESSAGE = 'Open AGI Workforce to sign in.';

export interface MobileIntentTokenOwner {
  tokenId: string;
  userId: string;
  organizationId: string | null;
  installId: string;
}

export class MobileIntentRefusal extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MobileIntentRefusal';
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function issueMobileIntentToken(
  db: DatabaseAdapter,
  owner: { userId: string; organizationId: string | null; installId: string },
): Promise<string> {
  const token = `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('base64url')}`;
  await db.transaction(async (tx) => {
    await tx.execute(
      `update public.mobile_intent_tokens
          set revoked_at = now()
        where user_id = $1 and install_id = $2 and revoked_at is null`,
      [owner.userId, owner.installId],
    );
    await tx.execute(
      `insert into public.mobile_intent_tokens (user_id, organization_id, install_id, token_hash)
       values ($1, $2, $3, $4)`,
      [owner.userId, owner.organizationId, owner.installId, hashToken(token)],
    );
  });
  return token;
}

export async function revokeMobileIntentTokens(
  db: DatabaseAdapter,
  userId: string,
  installId: string | null,
): Promise<void> {
  await db.execute(
    `update public.mobile_intent_tokens
        set revoked_at = now()
      where user_id = $1
        and revoked_at is null
        and ($2::text is null or install_id = $2)`,
    [userId, installId],
  );
}

export async function resolveMobileIntentToken(
  token: string,
): Promise<MobileIntentTokenOwner | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const rows = await getNeonDb().query<{
    id: string;
    user_id: string;
    organization_id: string | null;
    install_id: string;
  }>(
    `update public.mobile_intent_tokens
        set last_used_at = now()
      where token_hash = $1 and revoked_at is null and capability = 'chat_completion'
      returning id, user_id, organization_id, install_id`,
    [hashToken(token)],
  );
  const row = rows[0];
  return row
    ? {
        tokenId: row.id,
        userId: row.user_id,
        organizationId: row.organization_id,
        installId: row.install_id,
      }
    : null;
}

async function saveAskConversation(
  db: DatabaseAdapter,
  owner: MobileIntentTokenOwner,
  input: { prompt: string; answer: string; model: string },
): Promise<string> {
  const title =
    input.prompt.length > TITLE_MAX_CHARS
      ? `${input.prompt.slice(0, TITLE_MAX_CHARS).trim()}…`
      : input.prompt;
  const [conversation] = await db.query<{ id: string }>(
    `insert into web_conversations (user_id, organization_id, title, model, is_temporary)
     values ($1, $2, $3, $4, false)
     returning id`,
    [owner.userId, owner.organizationId, title, input.model],
  );
  if (!conversation) throw new Error('The Siri conversation was not created');
  const [question] = await db.query<{ id: string }>(
    `insert into web_messages (conversation_id, role, content, model, metadata)
     values ($1, 'user', $2, $3, $4::jsonb)
     returning id`,
    [conversation.id, input.prompt, input.model, JSON.stringify({ source: 'siri' })],
  );
  await db.execute(
    `insert into web_messages (conversation_id, role, content, model, metadata, parent_id)
     values ($1, 'assistant', $2, $3, $4::jsonb, $5::uuid)`,
    [
      conversation.id,
      input.answer,
      input.model,
      JSON.stringify({ source: 'siri' }),
      question?.id ?? null,
    ],
  );
  return conversation.id;
}

export async function answerMobileIntentAsk(input: {
  request: Request;
  owner: MobileIntentTokenOwner;
  prompt: string;
  signal: AbortSignal;
}): Promise<{ text: string; conversationId: string }> {
  const { owner, prompt, request, signal } = input;
  const access = accountAccessDecision(await readAccountStatus(owner.userId));
  if (!access.allowed) throw new MobileIntentRefusal(403, 'account_unavailable', access.message);
  if (await mustAcceptTerms(owner.userId, 'mobile_intent')) {
    throw new MobileIntentRefusal(
      403,
      'terms_acceptance_required',
      'Open AGI Workforce to review the updated terms.',
    );
  }

  const db = createClaimedUserScopedDb(getNeonDb(), {
    userId: owner.userId,
    organizationId: owner.organizationId,
  });
  const entitlement = await resolveEntitlementBundle(db, owner.userId, {
    workspaceOrganizationId: owner.organizationId,
  });
  await assertCapabilityAvailable(
    buildFlagSubject(request, {
      userId: owner.userId,
      workspaceId: owner.organizationId,
      role: null,
      plan: entitlement.plan,
      surface: 'mobile',
    }),
    'canChat',
    'Chat',
  );
  const decision = await evaluateManagedComputeAccess(
    db,
    owner.userId,
    entitlement.subscription,
    'mobile',
    { organizationId: owner.organizationId },
  );
  if (!decision.allowed) throw new MobileIntentRefusal(403, decision.code, decision.reason);

  const route = await selectUnattendedRoute(
    { db, userId: owner.userId },
    'auto',
    classifyTaskLocally(prompt, []).type,
    entitlement.plan,
  );
  const messages = [
    { role: 'system' as const, content: ASK_DIRECTIVE },
    { role: 'user' as const, content: prompt },
  ];
  const estimatedCostMicrousd = LLMCostCalculator.estimateCostMicrousd(
    route.provider,
    route.modelKey,
    Math.ceil((prompt.length + ASK_DIRECTIVE.length) / 3.5) + 32,
    MAX_OUTPUT_TOKENS,
  );
  const requestId = randomBytes(16).toString('hex');
  const reservation = await reserveManagedUsageRequest({
    db,
    userId: owner.userId,
    organizationId: owner.organizationId,
    idempotencyKey: `mobile-intent:${owner.tokenId}:${requestId}`,
    requestHash: fingerprintManagedUsageRequest({
      kind: 'mobile_intent_ask',
      tokenId: owner.tokenId,
      requestId,
      prompt,
      provider: route.provider,
      model: route.modelKey,
    }),
    provider: route.provider,
    model: route.modelKey,
    estimatedCostMicrousd,
    leaseSeconds: 120,
    planTier: entitlement.plan,
    isFlagship: isFlagshipRoutingSlot(getSlotForModel(route.modelKey)),
  });

  let completed = false;
  try {
    await markManagedUsageProviderStarted(reservation);
    const completion = await runScheduledCompletion({ messages, route, signal });
    if (!completion.text) throw new Error('The model returned no answer');
    completed = true;
    await finalizeManagedUsageRequest({
      ...reservation,
      outcome: 'completed',
      actualCostMicrousd: completion.costMicrousd,
      usage: {
        type: 'mobile_intent_ask',
        provider: route.provider,
        model: route.modelKey,
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
        totalTokens: completion.totalTokens,
      },
    });
    const conversationId = await saveAskConversation(db, owner, {
      prompt,
      answer: completion.text,
      model: route.modelKey,
    });
    return { text: completion.text, conversationId };
  } catch (error) {
    if (!completed) {
      await finalizeManagedUsageRequest({
        ...reservation,
        outcome: 'failed',
        actualCostMicrousd: 0,
        usage: {
          type: 'mobile_intent_ask',
          reason: error instanceof Error ? error.message : String(error),
        },
      }).catch((releaseError: unknown) => {
        logger.error(
          { error: releaseError, tokenId: owner.tokenId },
          '[mobile-intent] the usage reservation could not be released',
        );
      });
    }
    throw error;
  }
}
