/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  ACCESS_TOKEN_MAX_AGE_MS,
  encodeStoredToken,
  readStoredToken,
  writeStoredToken,
} from '../token-storage';

const KEY = 'auth_token';
const TOKEN = 'header.payload.signature';

beforeEach(() => {
  window.localStorage.clear();
});

describe('browser token storage', () => {
  it('round-trips a freshly written token', async () => {
    await writeStoredToken(KEY, TOKEN);
    expect(await readStoredToken(KEY, ACCESS_TOKEN_MAX_AGE_MS)).toBe(TOKEN);
  });

  it('never leaves the bearer token readable at rest', async () => {
    await writeStoredToken(KEY, TOKEN);
    expect(window.localStorage.getItem(KEY)).not.toContain(TOKEN);
  });

  it('drops and erases a token older than its max age', async () => {
    const stale = await encodeStoredToken(TOKEN, Date.now() - ACCESS_TOKEN_MAX_AGE_MS - 1000);
    window.localStorage.setItem(KEY, stale);

    expect(await readStoredToken(KEY, ACCESS_TOKEN_MAX_AGE_MS)).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('refuses a legacy plaintext entry instead of using it as a bearer token', async () => {
    window.localStorage.setItem(KEY, TOKEN);

    expect(await readStoredToken(KEY, ACCESS_TOKEN_MAX_AGE_MS)).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('refuses an entry that carries no stored-at stamp', async () => {
    const { securityManager } = await import('../security');
    window.localStorage.setItem(KEY, await securityManager.encryptAsync(TOKEN));

    expect(await readStoredToken(KEY, ACCESS_TOKEN_MAX_AGE_MS)).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});
