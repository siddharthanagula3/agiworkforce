/**
 * Prompt section normalization for cache-stable formatting.
 *
 * Ported from OpenClaw src/agents/prompt-cache-stability.ts (MIT, Peter Steinberger).
 * See THIRD_PARTY_LICENSES.md at repo root for full attribution.
 */

import { normalizeLowercaseStringOrEmpty } from './string-utils';

export function normalizeStructuredPromptSection(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

export function normalizePromptCapabilityIds(capabilities: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const capability of capabilities) {
    const value = normalizeLowercaseStringOrEmpty(normalizeStructuredPromptSection(capability));
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }
  // [...arr].sort() instead of arr.toSorted() so consumers on ES2022 libs
  // (e.g. services/api-gateway) can still depend on this package.
  return [...normalized].sort((left, right) => left.localeCompare(right));
}
