/**
 * Remove a model/provider echo of the CURRENT user prompt from the start of
 * an assistant response.
 *
 * This is intentionally exact and turn-scoped. It does not remove arbitrary
 * `You:` quotations: the echoed body must match the prompt that produced this
 * response. During streaming, an exact partial match is held back so the user
 * never watches their own prompt arrive token-by-token before the answer.
 */
export function stripLeadingCurrentPromptEcho(raw: string, prompt: string): string {
  const expected = prompt.trim();
  if (!expected) return raw;

  const leadingWhitespace = raw.length - raw.trimStart().length;
  const candidate = raw.slice(leadingWhitespace);
  const prefix = /^(?:>\s*)?(?:\*{1,2}|_{1,2})?You:(?:\*{1,2}|_{1,2})?\s*/i.exec(candidate);
  if (!prefix) return raw;

  const body = candidate.slice(prefix[0].length);
  if (body.length < expected.length && expected.startsWith(body)) {
    return '';
  }
  if (!body.startsWith(expected)) return raw;

  let answer = body.slice(expected.length);
  // Close optional markdown emphasis around the echoed prompt.
  answer = answer.replace(/^(?:\*{1,2}|_{1,2})?[ \t]*/, '');
  // Some provider templates emit a literal standalone period between the
  // serialized prompt and the public answer. Consume only that exact separator.
  answer = answer.replace(/^(?:\r?\n)+[ \t]*(?:>\s*)?\.[ \t]*(?:\r?\n)+/, '');
  return answer.replace(/^(?:\r?\n)+/, '');
}
