import { normalizeStructuredPromptSection } from './lib/prompt-cache-stability';

export const SYSTEM_PROMPT_CACHE_BOUNDARY = '\n<!-- AGIWORKFORCE_CACHE_BOUNDARY -->\n';

export function stripSystemPromptCacheBoundary(text: string): string {
  return text.replaceAll(SYSTEM_PROMPT_CACHE_BOUNDARY, '\n\n');
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

/**
 * Joins the system messages that open a conversation with any a client sent
 * later in it. The later ones go behind the cache boundary, so the cached
 * prefix is the same bytes whether or not a later system message arrived; the
 * opening text loses trailing whitespace either way, because the split that
 * caches the prefix trims it.
 */
export function joinSystemTextsAtCacheBoundary(
  opening: readonly string[],
  later: readonly string[],
): string {
  const joinedOpening = opening.filter((text) => text.length > 0).join('\n\n');
  const hasBoundary = joinedOpening.includes(SYSTEM_PROMPT_CACHE_BOUNDARY);
  const stable = hasBoundary ? joinedOpening : joinedOpening.trimEnd();
  const tail = later.filter((text) => text.length > 0).join('\n\n');
  if (!tail) return stable;
  return hasBoundary ? `${stable}\n\n${tail}` : `${stable}${SYSTEM_PROMPT_CACHE_BOUNDARY}${tail}`;
}
