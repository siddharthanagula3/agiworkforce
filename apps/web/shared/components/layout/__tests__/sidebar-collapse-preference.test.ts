import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useUIStore } from '@shared/stores/layout-store';

/**
 * Whether the sidebar is collapsed is a fact about this screen, not about the
 * account. A 13" laptop and a 32" monitor signed into the same workspace must
 * not fight over it, which means it lives in this browser's storage and is
 * never sent anywhere.
 */

const WEB_DIR = path.resolve(__dirname, '../../../..');
const STORES_DIR = path.resolve(WEB_DIR, 'shared/stores');
const PREFERENCE = 'sidebarCollapsed';
const STORAGE_KEY = 'agi-ui-store';

const SCAN_ROOTS = ['app', 'features', 'shared', 'lib'];
const SKIP_DIRS = new Set(['node_modules', '.next', '__tests__', '__mocks__', 'dist']);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...walk(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

const sourceFiles = SCAN_ROOTS.flatMap((root) => {
  const dir = path.resolve(WEB_DIR, root);
  return statSync(dir).isDirectory() ? walk(dir) : [];
});

const filesMentioningPreference = sourceFiles.filter((file) =>
  readFileSync(file, 'utf8').includes(PREFERENCE),
);

const relative = (file: string) => path.relative(WEB_DIR, file);

/** The `partialize` body of a zustand `persist(...)` config, key by key. */
function persistedKeys(source: string): string[] | null {
  const start = source.indexOf('partialize:');
  if (start === -1) return null;
  const open = source.indexOf('({', start);
  if (open === -1) return null;
  let depth = 0;
  let end = open + 1;
  for (let i = open + 1; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  return source
    .slice(open + 2, end)
    .split('\n')
    .map((line) => line.trim().match(/^([A-Za-z0-9_]+)\s*:/)?.[1])
    .filter((key): key is string => Boolean(key));
}

const storesPersistingPreference = readdirSync(STORES_DIR)
  .filter((name) => name.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(name))
  .map((name) => ({ name, source: readFileSync(path.join(STORES_DIR, name), 'utf8') }))
  .filter(({ source }) => persistedKeys(source)?.includes(PREFERENCE))
  .map(({ name }) => name);

describe('the collapsed sidebar is a preference of this device', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useUIStore.getState().reset();
  });

  it('keeps it in this browser rather than on the account', () => {
    useUIStore.getState().setSidebarCollapsed(true);

    const persisted = window.localStorage.getItem(STORAGE_KEY);
    expect(persisted).toBeTruthy();
    expect(JSON.parse(persisted!).state).toEqual({ [PREFERENCE]: true });
  });

  it('sends it nowhere when it changes', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));

    useUIStore.getState().setSidebarCollapsed(true);
    useUIStore.getState().setSidebarCollapsed(false);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('starts expanded on a device that has never been told otherwise', () => {
    window.localStorage.clear();

    useUIStore.persist.rehydrate();

    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('survives the next load of the same browser', () => {
    useUIStore.getState().setSidebarCollapsed(true);
    const persisted = window.localStorage.getItem(STORAGE_KEY)!;

    useUIStore.getState().reset();
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);

    window.localStorage.setItem(STORAGE_KEY, persisted);
    useUIStore.persist.rehydrate();

    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
  });

  it('persists nothing else from the same store alongside it', () => {
    useUIStore.getState().setSidebarCollapsed(true);
    useUIStore.getState().dismissAgiWorkAutonomyNotice();
    useUIStore.getState().setTaskDockOpen(true);

    expect(Object.keys(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).state)).toEqual([
      PREFERENCE,
    ]);
  });
});

describe('nothing else in the web app claims the preference', () => {
  it('never crosses the wire: no route handler or API client mentions it', () => {
    const offenders = filesMentioningPreference
      .map(relative)
      .filter((file) => file.startsWith('app/api/') || /\/services\//.test(file));

    expect(offenders).toEqual([]);
  });

  it('is never put in a request body', () => {
    const offenders = filesMentioningPreference.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return /JSON\.stringify\([^)]*sidebarCollapsed/.test(source);
    });

    expect(offenders.map(relative)).toEqual([]);
  });

  it('is persisted by exactly one store', () => {
    expect(storesPersistingPreference).toEqual(['layout-store.ts']);
  });
});
