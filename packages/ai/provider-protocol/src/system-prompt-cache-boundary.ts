/**
 * System prompt cache boundary marker.
 *
 * Splits system prompts into a stable prefix (long-cacheable) and a dynamic
 * suffix (short-cacheable) using a sentinel comment. Used by Anthropic-style
 * cache_control to maximize cache hit rates across turns.
 *
 * Ported from OpenClaw src/agents/system-prompt-cache-boundary.ts (MIT, Peter Steinberger).
 * See THIRD_PARTY_LICENSES.md at repo root for full attribution.
 */

import { normalizeStructuredPromptSection } from './lib/prompt-cache-stability';

export const SYSTEM_PROMPT_CACHE_BOUNDARY = '\n<!-- AGIWORKFORCE_CACHE_BOUNDARY -->\n';

export function stripSystemPromptCacheBoundary(text: string): string {
  return text.replaceAll(SYSTEM_PROMPT_CACHE_BOUNDARY, '\n');
}

export function splitSystemPromptCacheBoundary(
  text: string,
): { stablePrefix: string; dynamicSuffix: string } | undefined {
  const boundaryIndex = text.indexOf(SYSTEM_PROMPT_CACHE_BOUNDARY);
  if (boundaryIndex === -1) {
    return undefined;
  }
  return {
    stablePrefix: text.slice(0, boundaryIndex).trimEnd(),
    dynamicSuffix: text.slice(boundaryIndex + SYSTEM_PROMPT_CACHE_BOUNDARY.length).trimStart(),
  };
}

export function prependSystemPromptAdditionAfterCacheBoundary(params: {
  systemPrompt: string;
  systemPromptAddition?: string;
}): string {
  const systemPromptAddition =
    typeof params.systemPromptAddition === 'string'
      ? normalizeStructuredPromptSection(params.systemPromptAddition)
      : '';
  if (!systemPromptAddition) {
    return params.systemPrompt;
  }

  const split = splitSystemPromptCacheBoundary(params.systemPrompt);
  if (!split) {
    return `${systemPromptAddition}\n\n${params.systemPrompt}`;
  }

  const dynamicSuffix = split.dynamicSuffix
    ? normalizeStructuredPromptSection(split.dynamicSuffix)
    : '';
  if (!dynamicSuffix) {
    return `${split.stablePrefix}${SYSTEM_PROMPT_CACHE_BOUNDARY}${systemPromptAddition}`;
  }

  return `${split.stablePrefix}${SYSTEM_PROMPT_CACHE_BOUNDARY}${systemPromptAddition}\n\n${dynamicSuffix}`;
}
