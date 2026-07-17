/**
 * OpenAI reasoning effort resolution per model family.
 *
 * Resolves the supported `reasoning.effort` values from the canonical model
 * registry, with graceful fallbacks when a requested effort isn't supported.
 * Used by openai-responses-payload-policy.ts to decide whether to strip
 * `reasoning: "none"` payloads.
 *
 * Ported from OpenClaw src/agents/openai-reasoning-effort.ts (MIT, Peter Steinberger).
 * See THIRD_PARTY_LICENSES.md at repo root for full attribution.
 */

import { getModelMetadataById } from '@agiworkforce/types';

import { normalizeLowercaseStringOrEmpty } from './lib/string-utils';

export type OpenAIReasoningEffort =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

export type OpenAIApiReasoningEffort = OpenAIReasoningEffort | (string & {});

type OpenAIReasoningModel = {
  provider?: unknown;
  id?: unknown;
  api?: unknown;
  baseUrl?: unknown;
  compat?: unknown;
};

const OPENAI_CODEX_GENERIC_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh'] as const;
const GENERIC_REASONING_EFFORTS = ['low', 'medium', 'high'] as const;

export function normalizeOpenAIReasoningEffort(effort: string): string {
  return effort === 'minimal' ? 'minimal' : effort;
}

function readCompatReasoningEfforts(compat: unknown): OpenAIApiReasoningEffort[] | undefined {
  if (!compat || typeof compat !== 'object') {
    return undefined;
  }
  const raw = (compat as { supportedReasoningEfforts?: unknown }).supportedReasoningEfforts;
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const supported = [
    ...new Set(
      raw
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  return supported.length > 0 ? supported : undefined;
}

function isDisabledReasoningEffort(effort: string): boolean {
  return effort === 'none' || effort === 'off';
}

export function resolveOpenAISupportedReasoningEfforts(
  model: OpenAIReasoningModel,
): readonly OpenAIApiReasoningEffort[] {
  const compatEfforts = readCompatReasoningEfforts(model.compat);
  if (compatEfforts) {
    return compatEfforts;
  }

  const provider = normalizeLowercaseStringOrEmpty(
    typeof model.provider === 'string' ? model.provider : '',
  );
  const id = typeof model.id === 'string' ? model.id : undefined;
  const metadata = getModelMetadataById(id);
  if (metadata?.provider === 'openai') {
    const reasoning = metadata.reasoning;
    if (!reasoning?.capable || reasoning.control !== 'effort_levels') {
      return [];
    }
    return reasoning.supportedEfforts ?? [];
  }
  if (provider === 'openai-codex') {
    return OPENAI_CODEX_GENERIC_REASONING_EFFORTS;
  }
  return GENERIC_REASONING_EFFORTS;
}

export function supportsOpenAIReasoningEffort(
  model: OpenAIReasoningModel,
  effort: string,
): boolean {
  return resolveOpenAISupportedReasoningEfforts(model).includes(
    normalizeOpenAIReasoningEffort(effort) as OpenAIApiReasoningEffort,
  );
}

export function resolveOpenAIReasoningEffortForModel(params: {
  model: OpenAIReasoningModel;
  effort: string;
  fallbackMap?: Record<string, string>;
}): OpenAIApiReasoningEffort | undefined {
  const requested = normalizeOpenAIReasoningEffort(params.effort);
  const mapped = params.fallbackMap?.[requested] ?? requested;
  const normalized = normalizeOpenAIReasoningEffort(mapped);
  const supported = resolveOpenAISupportedReasoningEfforts(params.model);
  if (supported.includes(normalized as OpenAIApiReasoningEffort)) {
    return normalized as OpenAIApiReasoningEffort;
  }
  if (isDisabledReasoningEffort(requested) || isDisabledReasoningEffort(normalized)) {
    return undefined;
  }
  if (requested === 'minimal' && supported.includes('low')) {
    return 'low';
  }
  if ((requested === 'minimal' || requested === 'low') && supported.includes('medium')) {
    return 'medium';
  }
  if (requested === 'xhigh' && supported.includes('high')) {
    return 'high';
  }
  return supported.find((effort) => effort !== 'none');
}
