import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(APP_ROOT, 'manifest.json'), 'utf8')) as Record<
  string,
  unknown
>;

describe('Chrome manifest trust contract', () => {
  it('disallows incognito because Chrome local storage is shared across profiles', () => {
    expect(manifest['incognito']).toBe('not_allowed');
  });

  it('describes Managed Cloud chat without claiming Desktop owns chat inference', () => {
    expect(String(manifest['description'])).toContain('Managed Cloud');
    expect(String(manifest['description'])).not.toMatch(/for AGI Desktop/i);
  });
});
