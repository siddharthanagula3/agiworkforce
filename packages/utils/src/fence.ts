/**
 * Trust boundary fencing for untrusted content injected into LLM prompts.
 *
 * Wraps content in XML-style fence tags with a sentinel comment instructing
 * the model to treat the fenced content as data, not instructions. Applies
 * Unicode normalization and strips invisible/bidi control characters that
 * could be used for prompt injection via homograph or tokenization attacks.
 *
 * Mirrors the pattern established in apps/web/app/api/agents/execute/route.ts
 * and apps/web/app/api/completion/route.ts.
 *
 * @module fence
 */

const ZERO_WIDTH_AND_BIDI_RE = new RegExp('[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]', 'g');

/**
 * Wrap untrusted content in a trust-boundary fence.
 *
 * @param content    - The untrusted string to fence.
 * @param tag        - XML tag name for the fence (e.g. `'user_memory'`).
 * @param sentinel   - Human-readable comment placed inside the fence
 *                     explaining the content is untrusted.
 * @returns The fenced string, safe for concatenation into a system prompt.
 */
export function fenceUntrustedContent(content: string, tag: string, sentinel: string): string {
  if (!content || content.trim().length === 0) return '';

  const safe = content
    .normalize('NFC')
    .replace(ZERO_WIDTH_AND_BIDI_RE, '')
    .replace(new RegExp(`</?${tag}>`, 'gi'), '');

  return `<${tag}>\n<!-- ${sentinel} -->\n${safe}\n</${tag}>`;
}
