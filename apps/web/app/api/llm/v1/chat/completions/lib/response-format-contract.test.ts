import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { ChatCompletionRequestSchema, applyJsonObjectMode } from './request-processor';
import { JSON_OBJECT_DIRECTIVE } from './json-object-mode';

const base = {
  model: 'auto',
  messages: [{ role: 'user' as const, content: 'hello' }],
};

function parse(overrides: Record<string, unknown>) {
  return ChatCompletionRequestSchema.safeParse({ ...base, ...overrides });
}

describe('response_format — accepted', () => {
  it('accepts text', () => {
    expect(parse({ response_format: { type: 'text' } }).success).toBe(true);
  });

  it('accepts json_object on a non-streaming request', () => {
    expect(parse({ response_format: { type: 'json_object' }, stream: false }).success).toBe(true);
  });

  it('accepts json_object when stream is omitted', () => {
    expect(parse({ response_format: { type: 'json_object' } }).success).toBe(true);
  });

  it('accepts a request with no response_format at all', () => {
    expect(parse({}).success).toBe(true);
  });
});

describe('response_format — refused', () => {
  it('refuses json_schema, and says what to use instead', () => {
    const result = parse({ response_format: { type: 'json_schema', json_schema: {} } });

    expect(result.success).toBe(false);
    const message = result.success ? '' : result.error.issues[0]!.message;
    expect(message).toMatch(/json_object/);
    expect(message).toMatch(/tool_choice/);
  });

  it('refuses streamed json_object, and explains why the guarantee fails', () => {
    const result = parse({ response_format: { type: 'json_object' }, stream: true });

    expect(result.success).toBe(false);
    const message = result.success ? '' : result.error.issues[0]!.message;
    expect(message).toMatch(/stream: false/);
    expect(message).toMatch(/validated/);
  });

  it('still allows a streamed TEXT response', () => {
    expect(parse({ response_format: { type: 'text' }, stream: true }).success).toBe(true);
  });
});

describe('applyJsonObjectMode', () => {
  it('appends the directive to an existing system message', () => {
    const request = {
      ...base,
      messages: [
        { role: 'system' as const, content: 'You are helpful.' },
        { role: 'user' as const, content: 'hi' },
      ],
    } as Parameters<typeof applyJsonObjectMode>[0];

    applyJsonObjectMode(request);

    const system = request.messages[0]!;
    expect(system.content).toContain('You are helpful.');
    expect(String(system.content).endsWith(JSON_OBJECT_DIRECTIVE)).toBe(true);
  });

  it('inserts a system message when there is none', () => {
    const request = { ...base, messages: [{ role: 'user' as const, content: 'hi' }] } as Parameters<
      typeof applyJsonObjectMode
    >[0];

    applyJsonObjectMode(request);

    expect(request.messages[0]).toEqual({ role: 'system', content: JSON_OBJECT_DIRECTIVE });
    expect(request.messages).toHaveLength(2);
  });

  it('does not disturb the user turn', () => {
    const request = { ...base, messages: [{ role: 'user' as const, content: 'hi' }] } as Parameters<
      typeof applyJsonObjectMode
    >[0];

    applyJsonObjectMode(request);

    expect(request.messages[request.messages.length - 1]).toEqual({ role: 'user', content: 'hi' });
  });
});
