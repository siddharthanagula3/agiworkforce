import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const tauriSrc = resolve(__dirname, '../../src-tauri/src');
const webApiRoot = resolve(__dirname, '../../../web/app/api');

function rustSources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return rustSources(full);
    return full.endsWith('.rs') ? [full] : [];
  });
}

const sources = rustSources(tauriSrc).map((path) => ({
  path: relative(tauriSrc, path),
  text: readFileSync(path, 'utf8'),
}));

const syncPathPattern = /"[^"]*\/api\/(?:[a-z0-9-]+\/)*sync(?:\/[a-z0-9-]+)*"/g;

describe('desktop cloud sync transport', () => {
  it('defines exactly one CloudSyncClient, in the live data-layer transport', () => {
    const definitions = sources
      .filter(({ text }) => /\bpub struct CloudSyncClient\b/.test(text))
      .map(({ path }) => path);

    expect(definitions).toEqual(['data/cloud_sync.rs']);
  });

  it('has no dead integrations::sync transport module', () => {
    expect(existsSync(join(tauriSrc, 'integrations/sync'))).toBe(false);

    const integrationsMod = readFileSync(join(tauriSrc, 'integrations/mod.rs'), 'utf8');
    expect(integrationsMod).not.toMatch(/^pub mod sync;/m);
  });

  it('only targets sync routes that exist in the web API', () => {
    const targeted = new Map<string, string>();

    for (const { path, text } of sources) {
      for (const literal of text.match(syncPathPattern) ?? []) {
        const route = literal.slice(1, -1).slice(literal.slice(1, -1).indexOf('/api/'));
        targeted.set(route, path);
      }
    }

    expect(targeted.size).toBeGreaterThan(0);

    for (const [route, path] of targeted) {
      const routeFile = join(webApiRoot, route.replace('/api/', ''), 'route.ts');
      expect(
        existsSync(routeFile),
        `${path} targets ${route}, but ${relative(webApiRoot, routeFile)} does not exist`,
      ).toBe(true);
    }
  });
});
