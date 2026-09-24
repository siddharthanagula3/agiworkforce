import 'server-only';

import { isBlockedFinishReason, isMaxOutputFinishReason } from './turn-completeness';

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

export type JsonObjectFailureState = 'refused' | 'incomplete' | 'invalid';

export type JsonObjectSettlement =
  | { ok: true; content: string }
  | {
      ok: false;
      state: JsonObjectFailureState;
      status: 400 | 502;
      type: 'content_filter' | 'invalid_response_error';
      code: 'json_object_refused' | 'json_object_incomplete' | 'json_object_not_satisfied';
      message: string;
    };

export function settleJsonObjectCompletion(
  rawContent: string,
  finishReason: string | null,
): JsonObjectSettlement {
  if (isBlockedFinishReason(finishReason)) {
    return {
      ok: false,
      state: 'refused',
      status: 400,
      type: 'content_filter',
      code: 'json_object_refused',
      message: 'The model declined this request, so there is no JSON object to return.',
    };
  }

  const extraction = extractJsonObject(rawContent);
  if (extraction.ok && extraction.content !== undefined) {
    return { ok: true, content: extraction.content };
  }

  if (isMaxOutputFinishReason(finishReason)) {
    return {
      ok: false,
      state: 'incomplete',
      status: 502,
      type: 'invalid_response_error',
      code: 'json_object_incomplete',
      message:
        'The model reached its output limit before the JSON object was complete. ' +
        'Raise `max_tokens`, or ask for a smaller object.',
    };
  }

  return {
    ok: false,
    state: 'invalid',
    status: 502,
    type: 'invalid_response_error',
    code: 'json_object_not_satisfied',
    message: `${extraction.reason} Retry, or use \`tools\` with \`tool_choice\` for a schema-shaped payload.`,
  };
}
