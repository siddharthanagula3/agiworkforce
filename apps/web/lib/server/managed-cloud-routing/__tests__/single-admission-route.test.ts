import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

function appRoot(): string {
  const direct = process.cwd();
  if (existsSync(join(direct, 'db/neon'))) return direct;
  const nested = join(direct, 'apps/web');
  if (existsSync(join(nested, 'db/neon'))) return nested;
  throw new Error(`Could not locate apps/web from ${direct}`);
}

const APP_ROOT = appRoot();
const MODULE_DIR = 'lib/server/managed-cloud-routing/';
const SOURCE_DIRS = ['app', 'features', 'lib', 'shared'];
const SKIPPED_DIRS = new Set(['node_modules', '.next', '__tests__', '__mocks__', 'e2e']);

/**
 * Callers that resolve a managed route themselves, each with why it may.
 * Anything else asks `admitManagedCloudRoute`, so every Managed Cloud model
 * call runs on the one rule set.
 */
const RESOLVER_CALLERS: Readonly<Record<string, string>> = {
  'app/api/llm/v1/chat/completions/lib/request-processor.ts':
    'the chat turn: builds its request with this module and reads every rule itself',
  'app/api/llm/v1/route/preview/route.ts':
    'previews the request this module built for the account; makes no model call',
  'lib/services/model-rollout/rollout-routing-inputs.ts':
    'defines resolveWithObservedCapabilities for the chat turn',
};

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(join(APP_ROOT, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) files.push(...sourceFiles(path));
    } else if (/\.tsx?$/u.test(entry.name) && !/\.(test|spec)\.tsx?$/u.test(entry.name)) {
      files.push(path.split(sep).join('/'));
    }
  }
  return files;
}

const FILES = SOURCE_DIRS.flatMap(sourceFiles).filter((file) => !file.startsWith(MODULE_DIR));

function filesMatching(pattern: RegExp): string[] {
  return FILES.filter((file) => pattern.test(readFileSync(join(APP_ROOT, file), 'utf8')));
}

describe('one admission route for every Managed Cloud model call', () => {
  it('reads a real source tree', () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(FILES).toContain('app/api/llm/v1/chat/completions/lib/request-processor.ts');
    expect(FILES.some((file) => file.startsWith(MODULE_DIR))).toBe(false);
  });

  it('builds no managed routing request outside the module', () => {
    expect(filesMatching(/trustMode:\s*['"`]managed_cloud['"`]/u)).toEqual([]);
  });

  it('resolves a managed route only through the module or a listed caller', () => {
    const callers = filesMatching(
      /\b(resolveAutoRoute|resolveWithObservedCapabilities|previewAutoRoute)\(/u,
    );

    expect(callers.filter((file) => !(file in RESOLVER_CALLERS))).toEqual([]);
  });

  it('keeps every listed caller a real caller', () => {
    const callers = new Set(
      filesMatching(/\b(resolveAutoRoute|resolveWithObservedCapabilities|previewAutoRoute)\(/u),
    );

    expect(Object.keys(RESOLVER_CALLERS).filter((file) => !callers.has(file))).toEqual([]);
  });
});
