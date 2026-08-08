import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { logger } from '@/lib/logger';
import { __resetPseudonymizationKeyForTests, pseudonymizeIdentifier } from '../pseudonymize';

const ORIGINAL_SALT = process.env['LOG_SALT'];

describe('pseudonymizeIdentifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetPseudonymizationKeyForTests();
    process.env['LOG_SALT'] = 'test-log-salt';
  });

  afterEach(() => {
    if (ORIGINAL_SALT === undefined) delete process.env['LOG_SALT'];
    else process.env['LOG_SALT'] = ORIGINAL_SALT;
    __resetPseudonymizationKeyForTests();
  });

  it('is stable for the same identifier and domain', () => {
    const a = pseudonymizeIdentifier('user_123', 'device-id', 12);
    const b = pseudonymizeIdentifier('user_123', 'device-id', 12);
    expect(a).toBe(b);
    expect(a).toHaveLength(12);
    expect(a).toMatch(/^[0-9a-f]+$/);
  });

  it('never emits the identifier it was given', () => {
    expect(pseudonymizeIdentifier('user_123', 'device-id')).not.toContain('user_123');
  });

  it('separates namespaces so the same id differs across domains', () => {
    const asDevice = pseudonymizeIdentifier('shared-value', 'device-id');
    const asCode = pseudonymizeIdentifier('shared-value', 'device-code');
    expect(asDevice).not.toBe(asCode);
  });

  it('changes completely when the salt is rotated', () => {
    const before = pseudonymizeIdentifier('user_123', 'device-id');
    process.env['LOG_SALT'] = 'rotated-log-salt';
    __resetPseudonymizationKeyForTests();
    expect(pseudonymizeIdentifier('user_123', 'device-id')).not.toBe(before);
  });

  it('does not produce a reversible digest when LOG_SALT is unset', () => {
    // THE REGRESSION. The four call sites this replaced used
    // `sha256(id + (LOG_SALT ?? ''))`, so an unset LOG_SALT — only a WARNING
    // in validate-env, not a critical variable — silently emitted an unsalted
    // hash of an enumerable identifier. Anyone holding the user list could
    // reverse it. The fallback key must be unpredictable, not empty.
    delete process.env['LOG_SALT'];
    __resetPseudonymizationKeyForTests();

    const withNoSalt = pseudonymizeIdentifier('user_123', 'delete-account-subject', 16);

    const unsalted = createUnsaltedLegacyDigest('user_123', 16);
    expect(withNoSalt).not.toBe(unsalted);
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('warns exactly once per process about the missing salt, not once per call', () => {
    delete process.env['LOG_SALT'];
    __resetPseudonymizationKeyForTests();

    pseudonymizeIdentifier('a', 'device-id');
    pseudonymizeIdentifier('b', 'device-id');
    pseudonymizeIdentifier('c', 'device-id');

    expect(logger.error).toHaveBeenCalledOnce();
  });
});

/** The exact construction this module replaced, for the regression above. */
function createUnsaltedLegacyDigest(value: string, lengthHex: number): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return createHash('sha256')
    .update(value + '')
    .digest('hex')
    .slice(0, lengthHex);
}
