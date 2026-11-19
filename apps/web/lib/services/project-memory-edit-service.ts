import 'server-only';

import { randomUUID } from 'node:crypto';
import type { ProjectMemoryEditResponse } from '@agiworkforce/cloud-contracts';
import {
  openAIWireRequestToChatRequest,
  type OpenAIWireMessage,
  type OpenAIWireToolCall,
} from '@agiworkforce/provider-protocol';
import { estimateTokens } from '@agiworkforce/routing';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { resolveWireMode } from '@/app/api/llm/v1/chat/completions/lib/adapter-providers';
import { drainToLlmResponse } from '@/app/api/llm/v1/chat/completions/lib/adapter-response';
import {
  buildServerProviderAdapter,
  toGenericUpstreamError,
} from '@/lib/services/provider-adapter-service';
import { reserveBackgroundUsage } from '@/lib/services/background-usage-lease';
import { fingerprintManagedUsageRequest } from '@/lib/services/managed-usage-request-service';
import {
  admitManagedCloudRoute,
  type ManagedCloudAdmitted,
} from '@/lib/server/managed-cloud-routing/admission';
import {
  executeProjectMemoryEditTool,
  isMemoryTool,
  memoryToolDefinitions,
  type ProjectMemoryChange,
  type ProjectMemoryRemoval,
} from '@/lib/server/tools/memory-tools';
import { logger } from '@/lib/logger';

export const PROJECT_MEMORY_EDIT_QUOTA_FEATURE = 'project_memory_edit';

const MAX_MODEL_ROUNDS = 4;
const MAX_OUTPUT_TOKENS = 400;
const ROUND_TIMEOUT_MS = 25_000;
const LEASE_SECONDS = 150;
const MAX_REPLY_CHARS = 200;

const PROJECT_MEMORY_EDIT_SYSTEM_PROMPT =
  'You change what AGI remembers for one project. The person tells you what to add, change ' +
  'or remove in this project memory. Use search_memory to see what is saved, save_memory to ' +
  'add a fact, and forget_memory to remove memories; to change a memory, forget the old one ' +
  'and save the new one. Every tool works only on this project. The person confirms each ' +
  'removal after you reply. Do nothing else and answer no other request. Reply with one short ' +
  'line that names the change and starts with Added:, Updated: or Removed:, for example ' +
  '"Updated: deadline is March". When nothing needs changing, reply "Nothing was changed."';

export class ProjectMemoryEditUnavailableError extends Error {
  constructor() {
    super('No model can change memory right now.');
    this.name = 'ProjectMemoryEditUnavailableError';
  }
}

export interface RunProjectMemoryEditInput {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  planTier: string;
  projectId: string;
  message: string;
  source: string;
  signal?: AbortSignal;
}

function readToolCalls(value: unknown): OpenAIWireToolCall[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return [];
    const call = entry as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
    if (typeof call.id !== 'string' || typeof call.function?.name !== 'string') return [];
    return [
      {
        id: call.id,
        type: 'function' as const,
        function: {
          name: call.function.name,
          arguments: typeof call.function.arguments === 'string' ? call.function.arguments : '{}',
        },
      },
    ];
  });
}

function parseToolArguments(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function projectMemoryEditReply(content: string): string {
  const line =
    content
      .split('\n')
      .map((part) => part.trim())
      .find((part) => part.length > 0) ?? '';
  return line.length > MAX_REPLY_CHARS ? `${line.slice(0, MAX_REPLY_CHARS - 1).trimEnd()}…` : line;
}

export async function resolveProjectMemoryEditRoute(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string | null,
): Promise<ManagedCloudAdmitted | null> {
  const admission = await admitManagedCloudRoute({
    kind: 'utility',
    account: { db, userId, organizationId },
    need: { requiredCapabilities: ['functionCalling'] },
  });
  return admission.status === 'admitted' ? admission : null;
}

export async function runProjectMemoryEdit(
  input: RunProjectMemoryEditInput,
): Promise<ProjectMemoryEditResponse> {
  const admission = await resolveProjectMemoryEditRoute(
    input.db,
    input.userId,
    input.organizationId,
  );
  if (!admission) throw new ProjectMemoryEditUnavailableError();
  const { route, dispatchProvider } = admission;
  const adapter = buildServerProviderAdapter(dispatchProvider);
  const tools = memoryToolDefinitions();
  const messages: OpenAIWireMessage[] = [
    { role: 'system', content: PROJECT_MEMORY_EDIT_SYSTEM_PROMPT },
    { role: 'user', content: input.message },
  ];
  const promptTokensPerRound = estimateTokens(
    `${PROJECT_MEMORY_EDIT_SYSTEM_PROMPT}\n${input.message}\n${JSON.stringify(tools)}`,
    route.modelKey,
  );

  const lease = await reserveBackgroundUsage({
    db: input.db,
    userId: input.userId,
    organizationId: input.organizationId,
    planTier: input.planTier,
    idempotencyKey: `project-memory-edit:${input.userId}:${randomUUID()}`,
    requestHash: fingerprintManagedUsageRequest({
      kind: PROJECT_MEMORY_EDIT_QUOTA_FEATURE,
      projectId: input.projectId,
      message: input.message,
      provider: route.provider,
      model: route.modelKey,
    }),
    provider: route.provider,
    model: route.modelKey,
    routeId: route.routeId,
    estimatedPromptTokens: promptTokensPerRound * MAX_MODEL_ROUNDS,
    maxOutputTokens: MAX_OUTPUT_TOKENS * MAX_MODEL_ROUNDS,
    leaseSeconds: LEASE_SECONDS,
    quotaFeature: PROJECT_MEMORY_EDIT_QUOTA_FEATURE,
  });

  const changed: ProjectMemoryChange[] = [];
  const removals: ProjectMemoryRemoval[] = [];
  const usage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheCreation1hInputTokens: 0,
  };
  let reply = '';

  try {
    await lease.providerStarted();
    for (let round = 0; round < MAX_MODEL_ROUNDS; round += 1) {
      const signal = input.signal
        ? AbortSignal.any([input.signal, AbortSignal.timeout(ROUND_TIMEOUT_MS)])
        : AbortSignal.timeout(ROUND_TIMEOUT_MS);
      const response = await drainToLlmResponse(
        adapter.stream(
          openAIWireRequestToChatRequest({
            model: route.providerModelId,
            messages,
            tools,
            tool_choice: 'auto',
            max_tokens: MAX_OUTPUT_TOKENS,
            temperature: 0,
            stream: false,
          }),
          signal,
        ),
        route.modelKey,
        (chunk) => toGenericUpstreamError(dispatchProvider, chunk),
        resolveWireMode(dispatchProvider),
      );
      usage.promptTokens += response.promptTokens;
      usage.completionTokens += response.completionTokens;
      usage.totalTokens += response.totalTokens;
      usage.cacheReadInputTokens += response.cachedInputTokens ?? 0;
      usage.cacheCreationInputTokens += response.cacheCreationInputTokens ?? 0;
      usage.cacheCreation1hInputTokens += response.cacheCreation1hInputTokens ?? 0;

      const toolCalls = readToolCalls(response.tool_calls);
      if (toolCalls.length === 0) {
        reply = projectMemoryEditReply(response.content);
        break;
      }
      messages.push({
        role: 'assistant',
        content: response.content || null,
        tool_calls: toolCalls,
      });
      for (const call of toolCalls) {
        const args = parseToolArguments(call.function.arguments);
        const result =
          args && isMemoryTool(call.function.name)
            ? await executeProjectMemoryEditTool(call.function.name, args, {
                db: input.db,
                userId: input.userId,
                organizationId: input.organizationId,
                projectId: input.projectId,
                source: input.source,
                signal: input.signal,
                changes: changed,
                removals,
              })
            : {
                content: args
                  ? `Unknown tool: ${call.function.name}`
                  : `${call.function.name} was called with invalid arguments.`,
                isError: true,
              };
        messages.push({ role: 'tool', tool_call_id: call.id, content: result.content });
      }
    }
  } catch (error) {
    if (changed.length === 0 && removals.length === 0) {
      await lease
        .failed({
          type: PROJECT_MEMORY_EDIT_QUOTA_FEATURE,
          reason: error instanceof Error ? error.message : String(error),
        })
        .catch((releaseError: unknown) => {
          logger.error(
            { releaseError, userId: input.userId },
            '[project-memory-edit] reservation release failed',
          );
        });
      throw error;
    }
    logger.warn(
      { error, userId: input.userId },
      '[project-memory-edit] model stopped after changing memory',
    );
    reply = '';
  }

  await lease.completed({
    provider: route.provider,
    model: route.modelKey,
    routeId: route.routeId,
    usage,
    record: { ...usage, type: PROJECT_MEMORY_EDIT_QUOTA_FEATURE },
  });

  return { changed, removals, reply };
}
