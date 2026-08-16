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
  answer = answer.replace(/^(?:\*{1,2}|_{1,2})?[ \t]*/, '');
  answer = answer.replace(/^(?:\r?\n)+[ \t]*(?:>\s*)?\.[ \t]*(?:\r?\n)+/, '');
  return answer.replace(/^(?:\r?\n)+/, '');
}
