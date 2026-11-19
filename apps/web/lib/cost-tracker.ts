import 'server-only';

import type { CpstUsageFields } from '@/lib/cpst-telemetry';

export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningOutputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheCreation1hInputTokens?: number;
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
