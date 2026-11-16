/**
 * Strict client-side content filter.
 *
 * When minor mode or the adult safety preference is active, outgoing prompts
 * are checked against a keyword/pattern blocklist before being sent to any
 * LLM. The check is synchronous and purely client-side, no network call, no
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

export const MINOR_SAFE_REFUSAL =
  "Minor-safe mode is on for this device, so AGI can't help with this request. " +
  'Settings > Parental Controls explains how this mode works.';

/** Refusal shown when an adult has opted in to the stricter safety preference. */
export const REDUCED_SENSITIVE_CONTENT_REFUSAL =
  'This content is unavailable while Reduce sensitive content is on. ' +
  'You can change this in Settings > Safety & Security.';

export const SELF_HARM_HELPLINE =
  "If you're thinking about hurting yourself, a crisis line can help right now: call or text " +
  '988 in the US, or find one for your country at findahelpline.com. In an emergency, call ' +
  'your local emergency number.';

const SELF_HARM_TOPIC =
  /\b(suicid\w*|self[\s-]?harm\w*|(kill(ing)?|hurt(ing)?|harm(ing)?|cut(ting)?)\s+(myself|yourself|themselves|oneself)|end(ing)?\s+(my|your|their)\s+(own\s+)?life)\b/i;

export function checkContentFilter(
  prompt: string,
  enabled: boolean,
  refusal = MINOR_SAFE_REFUSAL,
): ContentFilterResult {
  const verdict = checkSharedContentFilter(prompt, enabled, refusal);
  if (verdict.allowed || !SELF_HARM_TOPIC.test(prompt)) return verdict;
  return { allowed: false, refusal: `${verdict.refusal}\n\n${SELF_HARM_HELPLINE}` };
}
