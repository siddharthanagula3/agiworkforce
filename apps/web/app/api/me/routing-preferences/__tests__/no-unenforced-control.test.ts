import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(__dirname, '../../../../..');

/**
 * A switch that persists and changes nothing is a dead control.
 *
 * This guard used to assert that the resolver read NEITHER routing preference,
 * and refused any control for either. `us_only` is now threaded through
 * `buildWebCloudAutoRoutingRequest` into the resolver, which is AGI-8, so half
 * of that premise is gone. The guarantee is inverted rather than deleted: the
 * enforced preference is pinned as enforced, and the rule that a control may
 * not ship ahead of its enforcement now applies to the one still waiting for
 * it.
 *
 * `geo_overlay` sits in the same schema, is persisted by the same route, and is
 * read by nothing. It is exactly what `us_only` was.
 */
const UNENFORCED_PREFERENCE_KEYS = ['geo_overlay', 'geoOverlay'];

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

function requestProcessor(): string {
  return readFileSync(
    join(WEB_ROOT, 'app/api/llm/v1/chat/completions/lib/request-processor.ts'),
    'utf8',
  );
}

function routerReads(keys: readonly string[]): boolean {
  const processor = requestProcessor();
  return keys.some((key) => processor.includes(key));
}

describe('a routing preference control may not ship ahead of its enforcement', () => {
  it('reads the US-only preference, so a control for it is now honest', () => {
    expect(routerReads(['usOnly', 'us_only'])).toBe(true);
  });

  it('still does not read the geographic overlay, so nothing enforces that one', () => {
    expect(routerReads(UNENFORCED_PREFERENCE_KEYS)).toBe(false);
  });

  it('has no control anywhere in the web surface for the preference nothing enforces', () => {
    if (routerReads(UNENFORCED_PREFERENCE_KEYS)) return;

    const offenders = sourceFiles(WEB_ROOT)
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return UNENFORCED_PREFERENCE_KEYS.some((key) => source.includes(key));
      })
      .map((file) => relative(WEB_ROOT, file))
      .filter((file) => !ALLOWED.has(file));

    expect(
      offenders,
      'A control for the geographic routing overlay may not ship while the route resolver ignores ' +
        'it: a switch that persists and changes nothing is a dead control. Either thread the ' +
        'preference through routing first, the way us_only now is, or render the control disabled ' +
        'with the reason and add it to the allow list here.',
    ).toEqual([]);
  });
});
