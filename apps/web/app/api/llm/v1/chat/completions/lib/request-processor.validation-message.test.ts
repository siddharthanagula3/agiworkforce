import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { ChatCompletionRequestSchema, validationRefusalMessage } from './request-processor';

describe('validationRefusalMessage', () => {
  it('names the first failing field in one sentence instead of the issue list', () => {
    const parsed = ChatCompletionRequestSchema.safeParse({
      model: 'fixture-model',
      messages: [{ role: 'user', content: 42 }],
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const message = validationRefusalMessage(parsed.error);
    expect(message).toMatch(/^messages\.0\.content: /);
    expect(message).not.toContain('[');
    expect(message).not.toContain('"code"');
  });

  it('falls back to the issue text when the failure has no path', () => {
    const parsed = ChatCompletionRequestSchema.safeParse('not an object');
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(validationRefusalMessage(parsed.error)).not.toMatch(/^: /);
  });
});
