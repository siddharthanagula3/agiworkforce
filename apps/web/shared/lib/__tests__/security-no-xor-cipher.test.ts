import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { securityManager } from '../security';

const source = readFileSync(resolve(import.meta.dirname, '../security.ts'), 'utf8');

describe('SecurityManager carries no reversible sync cipher', () => {
  it('exposes only the AES-GCM pair', () => {
    const manager = securityManager as unknown as Record<string, unknown>;
    expect(typeof manager['encryptAsync']).toBe('function');
    expect(typeof manager['decryptAsync']).toBe('function');
    expect(manager['encrypt']).toBeUndefined();
    expect(manager['decrypt']).toBeUndefined();
  });

  it('keeps the XOR key schedule out of the source', () => {
    expect(source).not.toContain('getSyncKey');
    expect(source).not.toMatch(/XOR/i);
  });
});
