import { describe, expect, it } from 'vitest';

import { ChatCompletionRequestSchema } from './request-processor';

const baseRequest = {
  model: 'auto',
  messages: [{ role: 'user' as const, content: 'What date is it?' }],
};

describe('managed chat client timezone', () => {
  it('accepts a valid IANA browser time zone', () => {
    expect(
      ChatCompletionRequestSchema.safeParse({
        ...baseRequest,
        client_timezone: 'America/Chicago',
      }).success,
    ).toBe(true);
  });

  it('rejects an invented or malformed time zone', () => {
    expect(
      ChatCompletionRequestSchema.safeParse({
        ...baseRequest,
        client_timezone: 'America/Not_Real',
      }).success,
    ).toBe(false);
  });
});
