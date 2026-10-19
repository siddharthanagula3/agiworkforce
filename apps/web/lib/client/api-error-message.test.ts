import { describe, expect, it } from 'vitest';

import { apiErrorMessage } from './api-error-message';

describe('apiErrorMessage', () => {
  it('reads both error body shapes the routes return', () => {
    expect(apiErrorMessage({ error: 'Plain.' }, 'fallback')).toBe('Plain.');
    expect(apiErrorMessage({ error: { code: 'X', message: 'Nested.' } }, 'fallback')).toBe(
      'Nested.',
    );
  });

  it('falls back when the body names no message', () => {
    expect(apiErrorMessage(null, 'fallback')).toBe('fallback');
    expect(apiErrorMessage({ error: { code: 'X' } }, 'fallback')).toBe('fallback');
  });
});
