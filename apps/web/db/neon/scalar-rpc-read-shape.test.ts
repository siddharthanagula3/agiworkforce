import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const WEB_ROOT = join(__dirname, '../..');
const MIGRATIONS = __dirname;
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', 'out', 'test-results']);

/**
 * `select * from fn(...)` expands a TABLE/SETOF function into its columns, but a
 * function returning a SCALAR (json, jsonb, boolean, text, …) yields exactly one
 * column named after the function. Reading that row as if it were the payload
 * makes every field `undefined` — silently, since nothing throws.
 *
 * That shipped twice: /api/claim-offer failed every valid invite redemption
 * AFTER claim_beta_invite had already consumed the invite, and /api/user/data
 * logged that delete_user_data had "declined erasure" on runs where it had just
 * performed one. Both read a scalar-returning function through `select *`.
 */
function declaredReturnTypes(): Map<string, string> {
  const types = new Map<string, string>();
  for (const file of readdirSync(MIGRATIONS)) {
    if (!file.endsWith('.sql')) continue;
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    const pattern =
      /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\([\s\S]*?\)\s*returns\s+([a-z ]*)/giu;
    for (const match of sql.matchAll(pattern)) {
      const name = match[1]!;
      const returns = (match[2] ?? '').trim().toLowerCase();
      types.set(name, returns);
    }
  }
  return types;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) sourceFiles(full, out);
      continue;
    }
    if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const SCALAR_RETURNS = /^(json|jsonb|text|boolean|bool|integer|int|bigint|uuid|numeric|void)\b/u;

describe('scalar-returning RPCs are never read through select *', () => {
  const returnTypes = declaredReturnTypes();

  it('knows the return type of the functions the migrations define', () => {
    expect(returnTypes.size).toBeGreaterThan(20);
    expect(returnTypes.get('claim_beta_invite')).toBe('json');
    expect(returnTypes.get('delete_user_data')).toBe('jsonb');
  });

  it('finds no caller reading a scalar function as if the row were its payload', () => {
    const offenders: string[] = [];
    const call = /select\s+\*\s+from\s+([a-z0-9_]+)\s*\(/giu;

    for (const file of sourceFiles(WEB_ROOT)) {
      const source = readFileSync(file, 'utf8');
      if (!source.includes('select * from')) continue;
      for (const match of source.matchAll(call)) {
        const fn = match[1]!;
        const returns = returnTypes.get(fn);
        if (!returns || !SCALAR_RETURNS.test(returns)) continue;
        // `select *` over a scalar function is only safe when the caller reads
        // the single column Postgres names after the function. A caller that
        // never mentions that name is reading the wrapper row as the payload.
        if (
          source.includes(`${fn}:`) ||
          source.includes(`.${fn}`) ||
          source.includes(`['${fn}']`)
        ) {
          continue;
        }
        offenders.push(
          `${relative(WEB_ROOT, file)}: select * from ${fn}() — ${fn} returns ${returns}, so the row is { ${fn}: … } and nothing here reads that key; alias it instead (select ${fn}(…) as result)`,
        );
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('would catch the two misreads this guard was written for', () => {
    const scalar = (fn: string) => SCALAR_RETURNS.test(returnTypes.get(fn) ?? '');
    expect(scalar('claim_beta_invite')).toBe(true);
    expect(scalar('delete_user_data')).toBe(true);
    // Both call sites are now aliased, so neither expands the function at all.
    for (const file of ['app/api/claim-offer/route.ts', 'app/api/user/data/route.ts']) {
      const source = readFileSync(join(WEB_ROOT, file), 'utf8');
      expect(source).not.toMatch(/select\s+\*\s+from\s+(claim_beta_invite|delete_user_data)/u);
      expect(source).toMatch(/as result/u);
    }
  });

  it('scans real files rather than passing on an empty sweep', () => {
    const files = sourceFiles(WEB_ROOT);
    expect(files.length).toBeGreaterThan(500);
    expect(files.every((file) => statSync(file).isFile())).toBe(true);
  });
});
