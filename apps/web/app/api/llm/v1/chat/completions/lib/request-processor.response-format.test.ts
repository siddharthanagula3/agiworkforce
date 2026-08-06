import { describe, expect, it } from 'vitest';
import { ChatCompletionRequestSchema } from './request-processor';

/**
 * `response_format` was validated and then read nowhere else in the repo, so a
 * caller could request `json_schema`, receive 200 OK, and get prose back. Their
 * parser then failed downstream with nothing pointing at the cause.
 *
 * Accepting a capability we do not honour is the failure mode these tests
 * guard. When structured output is genuinely enforced on this endpoint, delete
 * the rejection and replace these with tests that assert the OUTPUT conforms —
 * not with a re-widened enum.
 */

const base = {
  model: 'claude-opus-5',
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

  it('refuses json_object rather than silently returning prose', () => {
    const result = ChatCompletionRequestSchema.safeParse({
      ...base,
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
      response_format: { type: 'json_object' },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((i) => i.path.join('.') === 'response_format.type')).toBe(true);
  });
});
