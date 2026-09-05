import 'server-only';

import {
  getModelMetadataById,
  resolveEffectiveModelPricingForInputTokens,
} from '@agiworkforce/types';
import type { CpstUsageFields } from '@/lib/cpst-telemetry';
import {
  isCacheTokensDisjointFromInput,
  resolveCacheRates,
} from '@/lib/services/llm-cost-calculator';

export interface ModelUsage {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  requestCount: number;
  costUsd: number;
}

export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningOutputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheCreation1hInputTokens?: number;
}

const MAX_SESSIONS = 1000;

const sessionStore = new Map<string, Map<string, ModelUsage>>();

const sessionOrder: string[] = [];

function evictIfNeeded() {
  while (sessionOrder.length > MAX_SESSIONS) {
    const oldest = sessionOrder.shift();
    if (oldest) {
      sessionStore.delete(oldest);
    }
  }
}

function calculateCostUsd(modelId: string, usage: NormalizedUsage, asOf: Date): number {
  const meta = getModelMetadataById(modelId);
  if (!meta) {
    return 0;
  }

  const rawInputTokens = usage.inputTokens ?? 0;
  const cacheRead = usage.cacheReadInputTokens ?? 0;
  const cacheCreationTotal = usage.cacheCreationInputTokens ?? 0;
  const disjointFromInput = isCacheTokensDisjointFromInput(meta.provider);
  const tierInputTokens = disjointFromInput
    ? rawInputTokens + cacheRead + cacheCreationTotal
    : rawInputTokens;
  const effective = resolveEffectiveModelPricingForInputTokens(meta, asOf, tierInputTokens);
  const inputPerM = effective.inputCost ?? 0;
  const outputPerM = effective.outputCost ?? 0;

  const {
    read: cacheReadPerM,
    write5m: cacheCreationPerM,
    write1h: cacheCreation1hPerM,
  } = resolveCacheRates({
    inputCostPer1MTokens: inputPerM,
    cachedInputCostPer1MTokens:
      typeof effective.cached_input === 'number' ? effective.cached_input : undefined,
    cachedWriteCostPer1MTokens:
      typeof effective.cached_write === 'number' ? effective.cached_write : undefined,
    cachedWrite1hCostPer1MTokens:
      typeof effective.cached_write_1h === 'number' ? effective.cached_write_1h : undefined,
    cacheTokensDisjointFromInput: disjointFromInput,
  });

  const outputTokens = usage.outputTokens ?? 0;
  const reasoningTokens = usage.reasoningOutputTokens ?? 0;
  const cacheCreation1h = Math.min(
    cacheCreationTotal,
    Math.max(0, usage.cacheCreation1hInputTokens ?? 0),
  );
  const cacheCreation5m = cacheCreationTotal - cacheCreation1h;

  const billableInput = disjointFromInput
    ? rawInputTokens
    : Math.max(0, rawInputTokens - cacheRead - cacheCreationTotal);

  return (
    (billableInput * inputPerM) / 1_000_000 +
    (outputTokens * outputPerM) / 1_000_000 +
    (reasoningTokens * outputPerM) / 1_000_000 +
    (cacheRead * cacheReadPerM) / 1_000_000 +
    (cacheCreation5m * cacheCreationPerM) / 1_000_000 +
    (cacheCreation1h * cacheCreation1hPerM) / 1_000_000
  );
}

export function recordModelUsage(
  sessionId: string,
  modelId: string,
  usage: NormalizedUsage,
  asOf: Date = new Date(),
): void {
  if (!sessionStore.has(sessionId)) {
    sessionStore.set(sessionId, new Map());
    sessionOrder.push(sessionId);
    evictIfNeeded();
  }

  const sessionMap = sessionStore.get(sessionId)!;
  const existing = sessionMap.get(modelId) ?? {
    modelId,
    inputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    requestCount: 0,
    costUsd: 0,
  };

  existing.inputTokens += usage.inputTokens ?? 0;
  existing.outputTokens += usage.outputTokens ?? 0;
  existing.reasoningOutputTokens += usage.reasoningOutputTokens ?? 0;
  existing.cacheReadInputTokens += usage.cacheReadInputTokens ?? 0;
  existing.cacheCreationInputTokens += usage.cacheCreationInputTokens ?? 0;
  existing.requestCount += 1;
  existing.costUsd += calculateCostUsd(modelId, usage, asOf);

  sessionMap.set(modelId, existing);
}

export function getModelUsageReport(sessionId: string): Map<string, ModelUsage> {
  const source = sessionStore.get(sessionId);
  if (!source) return new Map();
  return new Map(Array.from(source.entries()).map(([k, v]) => [k, { ...v }]));
}

export function getSessionTotalCostUsd(sessionId: string): number {
  const report = sessionStore.get(sessionId);
  if (!report) return 0;
  let total = 0;
  for (const usage of report.values()) {
    total += usage.costUsd;
  }
  return total;
}

export function resetModelUsage(sessionId: string): void {
  sessionStore.delete(sessionId);
  const idx = sessionOrder.indexOf(sessionId);
  if (idx !== -1) sessionOrder.splice(idx, 1);
}

export function resetAllSessions(): void {
  sessionStore.clear();
  sessionOrder.length = 0;
}

export function inferGenAiSystem(provider: string): string {
  const normalized = provider.toLowerCase();
  if (normalized === 'anthropic') return 'anthropic';
  if (normalized === 'openai') return 'openai';
  if (normalized === 'google') return 'google_ai_studio';
  if (normalized === 'xai') return 'xai';
  if (normalized === 'deepseek') return 'deepseek';
  if (normalized === 'perplexity') return 'perplexity';
  if (normalized === 'qwen') return 'qwen';
  if (normalized === 'moonshot') return 'moonshot';
  if (normalized === 'zhipu') return 'zhipu';
  if (normalized === 'openrouter') return 'openrouter';
  if (normalized === 'ollama') return 'ollama';
  if (normalized === 'lmstudio') return 'lmstudio';
  return normalized;
}

export function toCpstOtelAttributes(
  cpst: CpstUsageFields,
): Record<string, number | string | boolean> {
  const attrs: Record<string, number | string | boolean> = {};
  if (cpst.taskOutcome !== undefined) attrs['codex.usage.task_outcome'] = cpst.taskOutcome;
  if (cpst.retries !== undefined) attrs['codex.usage.retries'] = cpst.retries;
  if (cpst.fallbackUsed !== undefined) attrs['codex.usage.fallback_used'] = cpst.fallbackUsed;
  if (cpst.fallbackReason !== undefined) attrs['codex.usage.fallback_reason'] = cpst.fallbackReason;
  if (cpst.verifierResult !== undefined) attrs['codex.usage.verifier_result'] = cpst.verifierResult;
  if (cpst.routePlanId !== undefined) attrs['codex.usage.route_plan_id'] = cpst.routePlanId;
  if (cpst.taskFamily !== undefined) attrs['codex.usage.task_family'] = cpst.taskFamily;
  if (cpst.taskFamilyConfidence !== undefined) {
    attrs['codex.usage.task_family_confidence'] = cpst.taskFamilyConfidence;
  }
  return attrs;
}

export function toOtelAttributes(
  provider: string,
  modelId: string,
  usage: NormalizedUsage,
  cpst?: CpstUsageFields,
): Record<string, number | string | boolean> {
  const attrs: Record<string, number | string | boolean> = {
    'gen_ai.system': inferGenAiSystem(provider),
    'gen_ai.request.model': modelId,
    'gen_ai.usage.input_tokens': usage.inputTokens ?? 0,
    'gen_ai.usage.output_tokens': usage.outputTokens ?? 0,
  };

  if (usage.cacheReadInputTokens != null) {
    attrs['gen_ai.usage.cache_read.input_tokens'] = usage.cacheReadInputTokens;
  }
  if (usage.cacheCreationInputTokens != null) {
    attrs['codex.usage.cache_creation_input_tokens'] = usage.cacheCreationInputTokens;
  }
  if (usage.cacheCreation1hInputTokens != null) {
    attrs['codex.usage.cache_creation_1h_input_tokens'] = usage.cacheCreation1hInputTokens;
  }
  if (usage.reasoningOutputTokens != null) {
    attrs['codex.usage.reasoning_output_tokens'] = usage.reasoningOutputTokens;
  }

  const total =
    (usage.inputTokens ?? 0) +
    (usage.outputTokens ?? 0) +
    (usage.reasoningOutputTokens ?? 0) +
    (usage.cacheCreationInputTokens ?? 0);
  attrs['codex.usage.total_tokens'] = total;

  if (cpst) Object.assign(attrs, toCpstOtelAttributes(cpst));

  return attrs;
}
