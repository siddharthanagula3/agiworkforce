import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(__dirname, '../../../../..');
const PREFERENCE_KEYS = ['us_only', 'usOnly', 'geo_overlay', 'geoOverlay'];

const ALLOWED = new Set(['app/api/me/routing-preferences/route.ts', 'app/api/me/route.ts']);

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.next',
  '.cache',
  'dist',
  'e2e',
  'test',
  '__tests__',
  'db',
]);

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRECTORIES.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
    found.push(full);
  }
  return found;
}

function routerReadsThePreference(): boolean {
  const processor = readFileSync(
    join(WEB_ROOT, 'app/api/llm/v1/chat/completions/lib/request-processor.ts'),
    'utf8',
  );
  return processor.includes('us_only') || processor.includes('usOnly');
}

describe('the region routing preference stays honest until routing enforces it', () => {
  it('is still not read by the route resolver, so nothing enforces it', () => {
    expect(routerReadsThePreference()).toBe(false);
  });

  it('has no control anywhere in the web surface while nothing enforces it', () => {
    if (routerReadsThePreference()) return;

    const offenders = sourceFiles(WEB_ROOT)
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return PREFERENCE_KEYS.some((key) => source.includes(key));
      })
      .map((file) => relative(WEB_ROOT, file))
      .filter((file) => !ALLOWED.has(file));

    expect(
      offenders,
      'A control for the region routing preference may not ship while the route resolver ignores ' +
        'it: a switch that persists and changes nothing is a dead control. Either thread the ' +
        'preference through routing first, or render the control disabled with the reason and add ' +
        'it to the allow list here.',
    ).toEqual([]);
  });
});
