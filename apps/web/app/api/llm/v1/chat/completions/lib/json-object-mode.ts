import 'server-only';

/**
 * `response_format: { type: 'json_object' }` enforcement.
 *
 * WHY THIS IS NARROW. Before this, the endpoint accepted the field in its
 * schema and read it nowhere, so a caller could ask for JSON, receive 200 OK,
 * and get prose — their parser then failed downstream with no indication why.
 * That was replaced by an honest refusal. This lifts the refusal for
 * `json_object` ONLY, and only where the guarantee can actually be kept.
 *
 * `json_schema` stays refused. Enforcing a caller-supplied schema means either
 * native per-provider support (which differs in shape and coverage across the
 * providers this gateway routes to) or a validate-and-retry loop that spends
 * the user's money on retries they did not ask for. Accepting the field and
 * returning unvalidated JSON would be the same silent-wrongness this file
 * exists to remove.
 *
 * STREAMING is likewise still refused for json_object: a stream hands the
 * caller bytes as they arrive, so by the time the payload can be parsed it has
 * already been delivered. Buffering the whole response to validate it would
 * make `stream: true` a lie. Refusing with a message that names the fix is the
 * honest option.
 */

/** The instruction appended to the system prompt when json_object is requested. */
export const JSON_OBJECT_DIRECTIVE = [
  'You must reply with a single valid JSON object and nothing else.',
  'Do not wrap it in a markdown code fence.',
  'Do not write any prose before or after it.',
].join(' ');

export interface JsonObjectExtraction {
  ok: boolean;
  /** The parsed object, re-serialized compactly. Only set when `ok`. */
  content?: string;
  /** Why extraction failed. Only set when not `ok`. */
  reason?: string;
}

/**
 * Strip the wrappers models add even when told not to.
 *
 * This is deliberately limited to UNWRAPPING — removing a code fence, or
 * trimming prose around a single top-level object. It never repairs malformed
 * JSON: guessing at a missing brace would hand the caller a document the model
 * did not actually produce, which is a different and worse failure than an
 * honest error.
 */
function unwrap(raw: string): string {
  let text = raw.trim();

  // ```json … ``` or ``` … ```
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/i.exec(text);
  if (fence?.[1]) text = fence[1].trim();

  // Prose around a single top-level object, e.g. "Here you go: { … }".
  if (!text.startsWith('{')) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) text = text.slice(start, end + 1).trim();
  }

  return text;
}

/**
 * Validate a completion against the json_object contract.
 *
 * A JSON *array*, string, or number is rejected: `json_object` names an object,
 * and OpenAI's own contract is an object. Silently widening it would make the
 * mode mean something different here than everywhere else it is used.
 */
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

  // Re-serialized so the caller receives exactly the parsed document, without
  // the fence or surrounding prose that may have been stripped above.
  return { ok: true, content: JSON.stringify(parsed) };
}

/** True when the request asked for json_object mode. */
export function wantsJsonObject(responseFormat: { type?: string } | undefined): boolean {
  return responseFormat?.type === 'json_object';
}
