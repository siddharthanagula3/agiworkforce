/**
 * Strict client-side content filter.
 *
 * When minor mode or the adult safety preference is active, outgoing prompts
 * are checked against a keyword/pattern blocklist before being sent to any
 * LLM. The check is synchronous and purely client-side — no network call, no
 * model evaluation.
 *
 * Policy: EU AI Act Article 5(1)(b) requires that AI systems not use
 * subliminal techniques or exploit vulnerabilities of minors. Our mitigation
 * is to refuse prompts that clearly request adult-only or harmful content
 * when minor mode is active.
 *
 * The refusal copy is exact and must not be changed without legal review.
 */

import {
  checkContentFilter as checkSharedContentFilter,
  type ContentFilterResult,
} from '@agiworkforce/types';

export type { ContentFilterResult } from '@agiworkforce/types';

/**
 * Exact refusal copy — do not modify without legal review.
 * Compliant with EU AI Act Article 5(1)(b) and Google Play GenAI policy.
 */
export const MINOR_SAFE_REFUSAL =
  "This content isn't available in AGI for users under the minimum age in your region. " +
  'If you believe this is an error, a parent or guardian can adjust age settings in Settings > Privacy.';

/** Refusal shown when an adult has opted in to the stricter safety preference. */
export const REDUCED_SENSITIVE_CONTENT_REFUSAL =
  'This content is unavailable while Reduce sensitive content is on. ' +
  'You can change this in Settings > Safety & Security.';

export function checkContentFilter(
  prompt: string,
  enabled: boolean,
  refusal = MINOR_SAFE_REFUSAL,
): ContentFilterResult {
  return checkSharedContentFilter(prompt, enabled, refusal);
}
