import { describe, expect, it } from 'vitest';
import { hasInlineCompletionCredential } from '../core/advancedFeatures';

describe('advanced feature activation', () => {
  it('accepts either browser-approved AGI Cloud auth or an AGI API key', () => {
    expect(hasInlineCompletionCredential('account-token', undefined)).toBe(true);
    expect(hasInlineCompletionCredential(undefined, 'api-key')).toBe(true);
    expect(hasInlineCompletionCredential('  ', '')).toBe(false);
    expect(hasInlineCompletionCredential(undefined, undefined)).toBe(false);
  });
});
