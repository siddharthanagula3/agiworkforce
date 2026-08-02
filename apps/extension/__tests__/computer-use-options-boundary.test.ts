import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (relativePath: string): string =>
  readFileSync(resolve(here, '..', relativePath), 'utf8');

describe('computer-use options trust boundary', () => {
  const options = read('src/options.ts');
  const background = read('src/background.ts');
  const driver = read('src/features/computer-use/cdpDriver.ts');

  it('discloses CDP, approved-site scope, default approval, and the bounded driver', () => {
    expect(options).toContain('Chrome DevTools Protocol (CDP)');
    expect(options).toContain('only after you start a run on an approved site');
    expect(options).toContain('Ask before acting is on by default');
    expect(options).toContain('does not expose an unrestricted CDP developer mode');
  });

  it('keeps the disclosure tied to the enforced default and per-action detach lifecycle', () => {
    expect(background).toMatch(/agi_cu_ask_before_acting'\]\s*!==\s*false/);
    expect(driver).toMatch(/await fn\(\);[\s\S]*finally \{[\s\S]*await detach\(tabId\)/);
  });
});
