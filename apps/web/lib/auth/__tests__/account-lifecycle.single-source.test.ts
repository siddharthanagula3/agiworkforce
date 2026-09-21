import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = path.resolve(__dirname, '../../..');
const SKIP_DIRECTORIES = new Set(['node_modules', '.next', 'dist', 'e2e', 'db']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function isTestFile(file: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(file) || file.includes(`${path.sep}__tests__${path.sep}`);
}

function sourceFiles(directory: string, collected: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry)) sourceFiles(full, collected);
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry))) continue;
    if (isTestFile(full)) continue;
    collected.push(full);
  }
  return collected;
}

const TEMPLATE_LITERAL = /`[^`]*`/g;

/**
 * A lifecycle read is a select that reaches profiles for the account status and
 * erasure_tombstones for an erasure in the same statement. Anything that pairs
 * those two is answering "may this account still be used", whatever it is called.
 */
function readsAccountLifecycle(source: string): boolean {
  for (const literal of source.match(TEMPLATE_LITERAL) ?? []) {
    const sql = literal.toLowerCase();
    if (!sql.includes('select')) continue;
    if (sql.includes('account_status') && sql.includes('erasure_tombstones')) return true;
  }
  return false;
}

describe('account lifecycle has one reader', () => {
  const files = sourceFiles(WEB_ROOT);

  it('finds source files to check, so an empty sweep cannot pass', () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it('is queried from exactly one module, which both the route gate and sign-in use', () => {
    const readers = files
      .filter((file) => readsAccountLifecycle(readFileSync(file, 'utf8')))
      .map((file) => path.relative(WEB_ROOT, file).split(path.sep).join('/'));

    expect(readers).toEqual(['lib/auth/account-lifecycle.ts']);
  });

  it('is reached by the route gate through that module rather than its own copy', () => {
    const gate = readFileSync(path.join(WEB_ROOT, 'lib/api-auth.ts'), 'utf8');

    expect(gate).toContain("from '@/lib/auth/account-lifecycle'");
    expect(gate).toContain('readAccountStatus(userId)');
  });
});
