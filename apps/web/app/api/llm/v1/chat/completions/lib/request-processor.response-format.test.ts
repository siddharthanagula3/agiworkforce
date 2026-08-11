import { describe, expect, it } from 'vitest';
import { requireProviderDefaultModel } from '@agiworkforce/types';
import { ChatCompletionRequestSchema } from './request-processor';

const CHAT_MODEL = requireProviderDefaultModel('anthropic');

/**
 * `response_format` was validated and then read nowhere else in the repo, so a
 * caller could request `json_schema`, receive 200 OK, and get prose back. Their
 * parser then failed downstream with nothing pointing at the cause.
 *
 * Accepting a capability we do not honour is the failure mode these tests
 * guard. This file previously said: "when structured output is genuinely
 * enforced on this endpoint, delete the rejection and replace these with tests
 * that assert the OUTPUT conforms — not with a re-widened enum."
 *
 * That has now happened for `json_object` ONLY. The enum was not re-widened:
 * `lib/json-object-mode.ts` parses and validates the completion before it is
 * returned, and `json-object-mode.test.ts` asserts the output conforms —
 * including that malformed JSON is REJECTED rather than repaired. Streamed
 * `json_object` and `json_schema` both remain refused, because neither
 * guarantee can be kept: a stream is delivered before it can be validated, and
 * a caller-supplied schema has no enforcement path here.
 */

const base = {
  model: CHAT_MODEL,
  messages: [{ role: 'user' as const, content: 'hello' }],
};

describe('response_format', () => {
  it("accepts type 'text', which is the actual behaviour", () => {
    const result = ChatCompletionRequestSchema.safeParse({
      ...base,
      response_format: { type: 'text' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts the field being omitted entirely', () => {
    expect(ChatCompletionRequestSchema.safeParse(base).success).toBe(true);
  });

  it('accepts json_object, which the response path now validates', () => {
    // Backed by real enforcement, not a widened enum — see
    // `json-object-mode.test.ts` for the output-conformance tests.
    const result = ChatCompletionRequestSchema.safeParse({
      ...base,
      response_format: { type: 'json_object' },
    });
    expect(result.success).toBe(true);
  });

  it('refuses json_object on a stream, where it cannot be validated', () => {
    const result = ChatCompletionRequestSchema.safeParse({
      ...base,
      stream: true,
      response_format: { type: 'json_object' },
    });
    expect(result.success).toBe(false);
  });

  it('refuses json_schema rather than silently returning prose', () => {
    const result = ChatCompletionRequestSchema.safeParse({
      ...base,
      response_format: { type: 'json_schema', json_schema: { name: 'x', schema: {} } },
    });
    expect(result.success).toBe(false);
  });

  it('tells the caller what to use instead', () => {
    // A bare "invalid input" leaves the caller guessing. The message has to
    // name the supported path, because one exists.
    const result = ChatCompletionRequestSchema.safeParse({
      ...base,
      response_format: { type: 'json_schema' },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const message = result.error.issues.map((i) => i.message).join(' ');
    expect(message).toContain('tools');
    expect(message).toContain('tool_choice');
  });

  it('points the error at response_format.type, not the whole request', () => {
    const result = ChatCompletionRequestSchema.safeParse({
      ...base,
      response_format: { type: 'json_schema' },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((i) => i.path.join('.') === 'response_format.type')).toBe(true);
  });
});
