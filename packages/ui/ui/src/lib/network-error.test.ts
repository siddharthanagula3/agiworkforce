import { describe, expect, it } from 'vitest';

import { toUserMessage } from './network-error';

describe('toUserMessage', () => {
  it.each([
    'HTTP 500: upstream exploded: trace 0xdeadbeef',
    'SELECT secret FROM customer_records',
    'TypeError: Cannot read properties of undefined',
  ])('keeps operator diagnostics out of presentation: %s', (raw) => {
    const error = Object.assign(new Error(raw), { status: 500 });
    expect(toUserMessage(error, 'Try again.')).toBe(
      'Something went wrong on our side. Try again shortly.',
    );
  });

  it('preserves safe, actionable wording', () => {
    expect(toUserMessage(new Error('Reconnect your calendar and try again.'), 'Try again.')).toBe(
      'Reconnect your calendar and try again.',
    );
  });
});
