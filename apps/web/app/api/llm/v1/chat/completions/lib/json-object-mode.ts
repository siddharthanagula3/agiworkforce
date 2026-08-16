import 'server-only';

export const JSON_OBJECT_DIRECTIVE = [
  'You must reply with a single valid JSON object and nothing else.',
  'Do not wrap it in a markdown code fence.',
  'Do not write any prose before or after it.',
].join(' ');

export interface JsonObjectExtraction {
  ok: boolean;
  content?: string;
  reason?: string;
}

function unwrap(raw: string): string {
  let text = raw.trim();

  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/i.exec(text);
  if (fence?.[1]) text = fence[1].trim();

  if (!text.startsWith('{')) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) text = text.slice(start, end + 1).trim();
  }

  return text;
}

export function extractJsonObject(rawContent: string): JsonObjectExtraction {
  const text = unwrap(rawContent);
  if (!text) {
    return { ok: false, reason: 'The model returned an empty response.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'The model did not return valid JSON.' };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      reason: 'The model returned valid JSON that is not an object.',
    };
  }

  return { ok: true, content: JSON.stringify(parsed) };
}

export function wantsJsonObject(responseFormat: { type?: string } | undefined): boolean {
  return responseFormat?.type === 'json_object';
}
