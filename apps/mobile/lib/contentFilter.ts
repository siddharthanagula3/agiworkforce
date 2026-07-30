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

// ---------------------------------------------------------------------------
// Blocklist
// ---------------------------------------------------------------------------

/**
 * Patterns checked against the lower-cased prompt.
 * Keep patterns specific enough to avoid over-blocking common school content.
 */
const STRICT_UNSAFE_PATTERNS: RegExp[] = [
  // Explicit sexual content requests
  /\b(porn|pornography|hentai|nsfw|xxx|erotic|explicit\s+sexual|nude\s+photo|naked\s+photo)\b/,
  // Requests for graphic violence how-tos
  /\b(how\s+to\s+kill|how\s+to\s+murder|instructions?\s+to\s+(harm|injure|kill))\b/,
  // Drug manufacturing / acquisition
  /\b(how\s+to\s+(make|synthesize|cook|manufacture)\s+(meth|heroin|fentanyl|cocaine|lsd))\b/,
  // Weapons manufacturing detail
  /\b(how\s+to\s+(build|make|3d\s+print)\s+a\s+(gun|firearm|bomb|explosive))\b/,
  // Alcohol solicitation by minors
  /\b(how\s+to\s+(buy|get|obtain)\s+alcohol\s+underage|fake\s+id)\b/,
  // Self-harm detailed methods
  /\b(how\s+to\s+(cut\s+yourself|self[\s-]harm\s+methods)|suicide\s+method)\b/,
  // Gambling solicitation
  /\b(how\s+to\s+(gamble|bet)\s+(online|without|underage))\b/,
];

// ---------------------------------------------------------------------------
// Filter result
// ---------------------------------------------------------------------------

export type ContentFilterResult = { allowed: true } | { allowed: false; refusal: string };

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Checks whether a prompt is allowed under the shared strict-content policy.
 *
 * @param prompt  The full user prompt text.
 * @param enabled Whether the strict-content policy is active.
 * @param refusal Refusal copy for the policy that activated the filter.
 */
export function checkContentFilter(
  prompt: string,
  enabled: boolean,
  refusal = MINOR_SAFE_REFUSAL,
): ContentFilterResult {
  if (!enabled) return { allowed: true };

  const lower = prompt.toLowerCase();
  for (const pattern of STRICT_UNSAFE_PATTERNS) {
    if (pattern.test(lower)) {
      return { allowed: false, refusal };
    }
  }
  return { allowed: true };
}
