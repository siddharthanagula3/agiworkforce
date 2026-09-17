import type { FlagEvaluation } from '@/lib/feature-flags/evaluate-flags';

import { PROMPT_IDS, isPromptId, type PromptId } from './prompt-manifest';
import { promptVersions } from './prompt-registry';

/**
 * A/B selection for a prompt, carried by the flag system rather than by a
 * second targeting mechanism of its own.
 *
 * One flag per prompt id, `prompt.<id>`, whose variants name versions: `v2`
 * serves version 2. `off`, an unparseable variant, and a version the manifest
 * no longer holds all fall through to the pinned version, so rolling back is
 * either disabling the flag or moving the pin, and neither depends on the other
 * arriving first.
 */

export const PROMPT_FLAG_PREFIX = 'prompt.';

const VARIANT_PATTERN = /^v(\d{1,4})$/;

export function promptFlagKey(id: PromptId): string {
  return `${PROMPT_FLAG_PREFIX}${id}`;
}

export function promptFlagVariant(version: number): string {
  return `v${version}`;
}

export function promptIdFromFlagKey(key: string): PromptId | null {
  if (!key.startsWith(PROMPT_FLAG_PREFIX)) return null;
  const id = key.slice(PROMPT_FLAG_PREFIX.length);
  return isPromptId(id) ? id : null;
}

export function promptVersionFromVariant(id: PromptId, variant: string): number | null {
  const matched = VARIANT_PATTERN.exec(variant);
  if (!matched) return null;
  const version = Number.parseInt(matched[1] ?? '', 10);
  return promptVersions(id).includes(version) ? version : null;
}

/**
 * The version each prompt should serve for this subject, read from the flags
 * already evaluated for the request. Absent, disabled and stale flags leave a
 * prompt out of the map entirely, which is how `resolvePrompt` reads "pinned".
 */
export function promptVariantsFromFlags(
  evaluations: Readonly<Record<string, FlagEvaluation>>,
): Record<string, number> {
  const variants: Record<string, number> = {};
  for (const [key, evaluation] of Object.entries(evaluations)) {
    const id = promptIdFromFlagKey(key);
    if (id === null || !evaluation.enabled) continue;
    const version = promptVersionFromVariant(id, evaluation.variant);
    if (version !== null) variants[id] = version;
  }
  return variants;
}

export const PROMPT_FLAG_KEYS: readonly string[] = PROMPT_IDS.map(promptFlagKey);
