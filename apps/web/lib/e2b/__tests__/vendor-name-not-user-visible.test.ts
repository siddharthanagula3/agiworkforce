import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { redactSandboxVendor } from '../execution-tools';

const WEB_ROOT = join(__dirname, '..', '..', '..');

/**
 * The sandbox vendor is deliberately not a user-facing detail: every command
 * result is passed through redactSandboxVendor before it reaches a transcript.
 * A hardcoded vendor name in UI copy bypasses that policy at the last step,
 * which is exactly how "Managed E2B environment" reached the Code page.
 */
describe('sandbox vendor stays out of user-visible copy', () => {
  it('scrubs the vendor from command output', () => {
    expect(redactSandboxVendor('connected to abc.e2b.dev')).toBe('connected to the sandbox host');
    expect(redactSandboxVendor('E2B_API_KEY missing')).toBe('the sandbox credential missing');
    expect(redactSandboxVendor('starting e2b runtime')).toBe('starting sandbox runtime');
  });

  it('keeps the vendor out of every rendered string on the Code surface', () => {
    const roots = ['features/code', 'features/code/components'];
    const components = roots.flatMap((root) =>
      readdirSync(join(WEB_ROOT, root))
        .filter((name) => name.endsWith('.tsx') && !name.endsWith('.test.tsx'))
        .map((name) => join(root, name)),
    );
    expect(components.length).toBeGreaterThan(0);

    for (const file of components) {
      const source = readFileSync(join(WEB_ROOT, file), 'utf-8');
      expect(source.match(/>[^<>{}]*\be2b\b[^<>{}]*</gi) ?? [], file).toEqual([]);
      expect(source.match(/(['`])[^'`]*\be2b\b[^'`]*\1/gi) ?? [], file).toEqual([]);
    }
  });
});
