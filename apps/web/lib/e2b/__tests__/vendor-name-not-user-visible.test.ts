import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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

  it('keeps the vendor out of the Code page terminal banner', () => {
    const source = readFileSync(join(WEB_ROOT, 'features/code/CloudCodePage.tsx'), 'utf-8');
    const renderedStrings = source.match(/>[^<>{}]*\be2b\b[^<>{}]*</gi) ?? [];
    expect(renderedStrings).toEqual([]);
    expect(source).toContain('Managed sandbox ·');
  });
});
