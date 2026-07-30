/**
 * Shared, deterministic strict-content filter used before a prompt reaches a
 * Local or Managed Cloud model. Product surfaces decide when the policy is
 * active and supply their own user-facing refusal copy.
 *
 * Keep patterns specific enough to avoid blocking ordinary educational,
 * medical, journalistic, or support-seeking discussion.
 */
const STRICT_UNSAFE_PATTERNS: readonly RegExp[] = [
  /\b(porn|pornography|hentai|nsfw|xxx|erotic|explicit\s+sexual|nude\s+photo|naked\s+photo)\b/,
  /\b(how\s+to\s+kill|how\s+to\s+murder|instructions?\s+to\s+(harm|injure|kill))\b/,
  /\b(how\s+to\s+(make|synthesize|cook|manufacture)\s+(meth|heroin|fentanyl|cocaine|lsd))\b/,
  /\b(how\s+to\s+(build|make|3d\s+print)\s+a\s+(gun|firearm|bomb|explosive))\b/,
  /\b(how\s+to\s+(buy|get|obtain)\s+alcohol\s+underage|fake\s+id)\b/,
  /\b(how\s+to\s+(cut\s+yourself|self[\s-]harm\s+methods)|suicide\s+method)\b/,
  /\b(how\s+to\s+(gamble|bet)\s+(online|without|underage))\b/,
];

export type ContentFilterResult = { allowed: true } | { allowed: false; refusal: string };

export function checkContentFilter(
  prompt: string,
  enabled: boolean,
  refusal: string,
): ContentFilterResult {
  if (!enabled) return { allowed: true };

  const normalized = prompt.toLowerCase();
  for (const pattern of STRICT_UNSAFE_PATTERNS) {
    if (pattern.test(normalized)) {
      return { allowed: false, refusal };
    }
  }
  return { allowed: true };
}
