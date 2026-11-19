import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { describe, expect, it, vi, type Mock } from 'vitest';

import {
  restrictStorageToTrustedContexts,
  TRUSTED_ONLY_STORAGE_AREAS,
  type StorageAccessLevelAreas,
} from '../src/features/background/storageAccess';
import { contentScriptPageUrl } from '../src/features/background/contentAccess';

const APP_ROOT = process.cwd();
const STATIC_IMPORT =
  /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s*)?['"](\.{1,2}\/[^'"]+)['"]/gm;
const DYNAMIC_IMPORT = /\bawait\s+import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
const EXTENSION_STORAGE = /\bchrome\s*\.\s*storage\b|\bbrowser\s*\.\s*storage\b/;

function resolveSource(from: string, specifier: string): string {
  const base = resolve(dirname(from), specifier.replace(/\?.*$/, ''));
  const candidates = [base, `${base}.ts`, `${base}.js`, resolve(base, 'index.ts')];
  const found = candidates.find((path) => existsSync(path) && statSync(path).isFile());
  if (!found) throw new Error(`Unresolved import ${specifier} from ${from}`);
  return found;
}

function contentScriptSources(): string[] {
  const seen = new Set<string>();
  const queue = [resolve(APP_ROOT, 'src/content.ts')];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || !/\.(?:ts|js|mjs)$/.test(file)) continue;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const match of [...text.matchAll(STATIC_IMPORT), ...text.matchAll(DYNAMIC_IMPORT)])
      queue.push(resolveSource(file, match[1]!));
  }
  return [...seen];
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('the content script never touches extension storage', () => {
  it('walks the bundle the content build starts from', () => {
    const sources = contentScriptSources().map((file) => relative(APP_ROOT, file));
    expect(sources).toContain('src/content.ts');
    expect(sources).toContain('src/inPagePanel/setup.ts');
    expect(sources).toContain('src/webmcp.ts');
    expect(sources).toContain('src/features/content/workerAccess.ts');
  });

  it('has no storage read or write anywhere it imports', () => {
    const offenders = contentScriptSources()
      .filter((file) => EXTENSION_STORAGE.test(withoutComments(readFileSync(file, 'utf8'))))
      .map((file) => relative(APP_ROOT, file));
    expect(offenders).toEqual([]);
  });
});

describe('storage access level', () => {
  function areas(failing: ReadonlySet<string> = new Set()) {
    return Object.fromEntries(
      TRUSTED_ONLY_STORAGE_AREAS.map((name) => [
        name,
        {
          setAccessLevel: vi.fn(async () => {
            if (failing.has(name)) throw new Error(`${name} refused`);
          }),
        },
      ]),
    ) as unknown as StorageAccessLevelAreas & Record<string, { setAccessLevel: Mock }>;
  }

  it('limits every area to extension pages and the service worker', async () => {
    const storage = areas();
    await restrictStorageToTrustedContexts(storage, vi.fn());
    for (const name of ['local', 'session', 'sync', 'managed'])
      expect(storage[name]!.setAccessLevel).toHaveBeenCalledWith({
        accessLevel: 'TRUSTED_CONTEXTS',
      });
  });

  it('reports an area it could not restrict and still restricts the rest', async () => {
    const storage = areas(new Set(['managed']));
    const onFailure = vi.fn();
    await restrictStorageToTrustedContexts(storage, onFailure);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0]![0]).toBe('managed');
    expect(storage['local']!.setAccessLevel).toHaveBeenCalled();
  });
});

describe('content-script sender identity', () => {
  const EXTENSION_ID = 'extension-under-test';
  const page = { id: EXTENSION_ID, url: 'https://acme.example/a?b=1', frameId: 0, tab: { id: 4 } };

  it('speaks only for the top frame of a web page in a tab', () => {
    expect(contentScriptPageUrl(page, EXTENSION_ID)).toBe('https://acme.example/a?b=1');
    expect(contentScriptPageUrl({ ...page, frameId: 2 }, EXTENSION_ID)).toBeNull();
    expect(contentScriptPageUrl({ ...page, id: 'other' }, EXTENSION_ID)).toBeNull();
    expect(contentScriptPageUrl({ ...page, tab: {} }, EXTENSION_ID)).toBeNull();
    expect(
      contentScriptPageUrl({ ...page, url: `chrome-extension://${EXTENSION_ID}/x` }, EXTENSION_ID),
    ).toBeNull();
    expect(contentScriptPageUrl({ ...page, url: 'not a url' }, EXTENSION_ID)).toBeNull();
  });
});
