import { describe, expect, it } from 'vitest';
import { requireProviderDefaultModel } from '@agiworkforce/types';
import { ChatCompletionRequestSchema } from './request-processor';

const CHAT_MODEL = requireProviderDefaultModel('anthropic');

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

  it('refuses a json_schema whose root is not an object', () => {
    const result = ChatCompletionRequestSchema.safeParse({
      ...base,
      response_format: { type: 'json_schema', json_schema: { name: 'x', schema: {} } },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a json_schema it can enforce', () => {
    const result = ChatCompletionRequestSchema.safeParse({
      ...base,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'receipt',
          schema: {
            type: 'object',
            properties: { total: { type: 'number' } },
            required: ['total'],
            additionalProperties: false,
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('asks for the schema when json_schema names none', () => {
    const result = ChatCompletionRequestSchema.safeParse({
      ...base,
      response_format: { type: 'json_schema' },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      result.error.issues.some((i) => i.path.join('.') === 'response_format.json_schema'),
    ).toBe(true);
  });
});
