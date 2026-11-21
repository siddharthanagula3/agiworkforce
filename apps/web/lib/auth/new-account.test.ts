import { describe, expect, it } from 'vitest';

import { NEW_ACCOUNT_WINDOW_MS, isNewAccount } from './new-account';

const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);

describe('isNewAccount', () => {
  it('recognises an account the provider created seconds ago', () => {
    expect(isNewAccount({ createdAt: NOW - 4_000 }, NOW)).toBe(true);
  });

  it('still recognises it at the edge of the window', () => {
    expect(isNewAccount({ createdAt: NOW - NEW_ACCOUNT_WINDOW_MS }, NOW)).toBe(true);
  });

  it('does not treat an older account as new', () => {
    expect(isNewAccount({ createdAt: NOW - NEW_ACCOUNT_WINDOW_MS - 1 }, NOW)).toBe(false);
    expect(isNewAccount({ createdAt: NOW - 30 * 24 * 60 * 60_000 }, NOW)).toBe(false);
  });

  it('tolerates a provider clock slightly ahead of this server', () => {
    expect(isNewAccount({ createdAt: NOW + 5_000 }, NOW)).toBe(true);
  });

  it('refuses a creation time far in the future', () => {
    expect(isNewAccount({ createdAt: NOW + 10 * 60_000 }, NOW)).toBe(false);
  });

  it('is not new when the provider gave no creation time or no account', () => {
    expect(isNewAccount({ createdAt: null }, NOW)).toBe(false);
    expect(isNewAccount(null, NOW)).toBe(false);
  });
});
