import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { modelRegistry } from '@agiworkforce/model-registry';
import { getRegistryRoute, normalizeModelId, type ProviderAdapter } from '@agiworkforce/types';
import { isGmailRestToolName } from '@/lib/connectors/gmail-rest';
import { getNeonDb } from '@/lib/server/neon-db';
import { serverProviderHasEndpointOverride } from '@/lib/services/provider-adapter-service';
import { resolveZeroDataRetentionProviderOverrides } from '@/lib/services/zero-data-retention-provider-overrides';
import type { ProcessedRequest } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import type { makeUserConnectorExecutor } from '@/lib/user-connector-tools';

export type GmailDataPolicyContext = {
  userId: string;
  conversationId: string;
  organizationId: string | null;
};

export class GmailDataPolicyError extends Error {
  readonly code = 'gmail_data_route_restricted';
  constructor(
    message = 'Gmail conversations require an eligible managed route with mandatory zero data retention. Free, BYOK, custom endpoints and unverified routes are unavailable.',
  ) {
    super(message);
    this.name = 'GmailDataPolicyError';
  }
}

export function gmailRouteEligible(
  processed: Pick<
    ProcessedRequest,
    'provider' | 'llmRequest' | 'zeroDataRetentionOnly' | 'freeLane' | 'freeTrial'
  >,
  phase: 'discovery' | 'dispatch' = 'dispatch',
): boolean {
  if (
    (phase === 'dispatch' && !processed.zeroDataRetentionOnly) ||
    processed.freeLane ||
    processed.freeTrial
  )
    return false;
  const provider = processed.provider;
  const governance = (modelRegistry.governance as Record<string, { trainsOnInputs: string }>)[
    provider
  ];
  if (governance?.trainsOnInputs !== 'never' || serverProviderHasEndpointOverride(provider))
    return false;
  const route = getRegistryRoute(
    `${provider}/${normalizeModelId(processed.llmRequest.model) ?? processed.llmRequest.model}`,
  );
  if (!route?.trustModes.includes('managed_cloud') || route.commercialStatus === 'customer_byok')
    return false;
  return provider === 'vercel_gateway' || resolveZeroDataRetentionProviderOverrides().has(provider);
}

export async function readGmailConversationRestriction(
  db: Pick<DatabaseAdapter, 'query'>,
  context: GmailDataPolicyContext,
): Promise<boolean> {
  const [row] = await db.query<{ gmail_data_present: boolean }>(
    `select gmail_data_present from public.web_conversations
      where id = $1 and user_id = $2 and organization_id is not distinct from $3::uuid
        and deleted_at is null limit 1`,
    [context.conversationId, context.userId, context.organizationId],
  );
  if (!row || typeof row.gmail_data_present !== 'boolean') throw new GmailDataPolicyError();
  return row.gmail_data_present;
}

export async function assertGmailRunAdmission(
  db: Pick<DatabaseAdapter, 'query'>,
  context: {
    runId: string;
    userId: string;
    organizationId: string | null;
    conversationId?: string | null;
  },
): Promise<string | null> {
  const [row] = await db.query<{ conversation_id: string | null; gmail_data_quarantined: boolean }>(
    `select conversation_id, gmail_data_quarantined from public.cloud_agent_runs
      where id = $1 and user_id = $2 and organization_id is not distinct from $3::uuid limit 1`,
    [context.runId, context.userId, context.organizationId],
  );
  if (
    !row ||
    typeof row.gmail_data_quarantined !== 'boolean' ||
    !(
      row.conversation_id === null ||
      (typeof row.conversation_id === 'string' && row.conversation_id.length > 0)
    )
  ) {
    throw new GmailDataPolicyError(
      'This run cannot continue because its owned data provenance could not be verified.',
    );
  }
  if (context.conversationId !== undefined && row.conversation_id !== context.conversationId) {
    throw new GmailDataPolicyError(
      'This run cannot continue because its stored conversation binding does not match the continuation.',
    );
  }
  if (row.gmail_data_quarantined && row.conversation_id === null) {
    throw new GmailDataPolicyError(
      'This older run has no conversation binding and cannot continue because its Gmail data provenance is unknown. Start a new conversation to continue.',
    );
  }
  return row.conversation_id;
}

export async function assertGmailModelDispatch(
  processed: ProcessedRequest,
  db: DatabaseAdapter = getNeonDb(),
): Promise<void> {
  if (!processed.gmailDataPolicy) {
    if (processed.gmailDataPresent) throw new GmailDataPolicyError();
    return;
  }
  const restricted = await readGmailConversationRestriction(db, processed.gmailDataPolicy);
  if (!restricted && !processed.gmailDataPresent) return;
  processed.gmailDataPresent = true;
  if (processed.researchMode)
    throw new GmailDataPolicyError(
      'Gmail conversations cannot use research mode because its search and fetch destinations are not admitted for Gmail data.',
    );
  if (!gmailRouteEligible(processed)) throw new GmailDataPolicyError();
  processed.llmRequest.usePromptCache = false;
  processed.llmRequest.promptCacheScope = undefined;
}

export function bindGmailConnectorExecutor(
  execute: ReturnType<typeof makeUserConnectorExecutor>,
  processed: ProcessedRequest,
  userId: string,
): ReturnType<typeof makeUserConnectorExecutor> {
  return (serverId, toolName, args, options) =>
    execute(serverId, toolName, args, {
      ...options,
      invocationMode: 'model',
      beforeGmailInvocation: async () => {
        const serving = options?.servingRequest ?? processed;
        const context = serving.gmailDataPolicy;
        const originalContext = processed.gmailDataPolicy;
        if (
          !context ||
          !originalContext ||
          context.userId !== userId ||
          context.conversationId !== originalContext.conversationId ||
          context.organizationId !== originalContext.organizationId ||
          !gmailRouteEligible(serving, 'discovery')
        )
          throw new GmailDataPolicyError();
        serving.zeroDataRetentionOnly = true;
        serving.llmRequest.usePromptCache = false;
        serving.llmRequest.promptCacheScope = undefined;
        const [row] = await getNeonDb().query<{ gmail_data_present: boolean }>(
          `update public.web_conversations set gmail_data_present = true
          where id = $1 and user_id = $2 and organization_id is not distinct from $3::uuid
            and deleted_at is null returning gmail_data_present`,
          [context.conversationId, context.userId, context.organizationId],
        );
        if (row?.gmail_data_present !== true) throw new GmailDataPolicyError();
        serving.gmailDataPresent = true;
        processed.gmailDataPresent = true;
      },
    });
}

export function gmailDataPolicyContext(
  userId: string,
  processed: Pick<ProcessedRequest, 'conversationId' | 'organizationId'>,
): GmailDataPolicyContext | undefined {
  return processed.conversationId
    ? {
        userId,
        conversationId: processed.conversationId,
        organizationId: processed.organizationId ?? null,
      }
    : undefined;
}

export function protectGmailProviderAdapter(
  adapter: ProviderAdapter,
  processed: ProcessedRequest,
): ProviderAdapter {
  return {
    ...adapter,
    async *stream(request, signal) {
      await assertGmailModelDispatch(processed);
      if (processed.gmailDataPresent && !request.zeroDataRetentionOnly)
        throw new GmailDataPolicyError();
      if (processed.gmailDataPresent) {
        const tools = request.tools?.filter(
          (tool) =>
            tool.name.startsWith('mcp__gmail__') &&
            isGmailRestToolName(tool.name.slice('mcp__gmail__'.length)),
        );
        const requestedChoice = request.toolChoice;
        const toolChoice =
          tools?.length &&
          (typeof requestedChoice !== 'object' ||
            tools.some((tool) => tool.name === requestedChoice.name))
            ? requestedChoice
            : undefined;
        request = {
          ...request,
          tools,
          toolChoice,
          rawVendorTools: undefined,
          promptCache: undefined,
        };
      }
      yield* adapter.stream(request, signal);
    },
  };
}
