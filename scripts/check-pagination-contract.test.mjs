import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CHECKLIST_COLLECTIONS,
  CONTRACT_PATH,
  REPO_ROOT,
  checkPaginationContract,
  findPagedRoutes,
  loadContract,
} from './check-pagination-contract.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const HELPERS = `
export function clampPageSize(n: number) { return n; }
export function encodeKeysetCursor(c: { sortValue: string; id: string }) {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}
export function decodeKeysetCursor(v: string) { return v; }
export function buildPage(rows: unknown[]) { return rows; }
export function keysetSql(input: { sortColumn: string; idColumn?: string }) {
  const sortColumn = input.sortColumn;
  const idColumn = input.idColumn ?? 'id';
  const orderBy = \`order by \${sortColumn} desc, \${idColumn} desc\`;
  return { orderBy };
}
`;

const KEYSET_ROUTE = `
import { keysetSql, decodeKeysetCursor } from '@/lib/identity/pagination';
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const cursor = decodeKeysetCursor(searchParams.get('cursor'));
  return keysetSql({ sortColumn: 'updated_at', cursor });
}
`;

function contract(overrides = {}) {
  const collections = {};
  for (const name of CHECKLIST_COLLECTIONS) {
    collections[name] = {
      route: 'apps/web/app/api/things/route.ts',
      why: 'keyset paged on the shared helpers',
    };
  }
  return {
    routeRoot: 'apps/web/app/api',
    pageParams: ['limit', 'cursor', 'page', 'offset'],
    cursorHelpers: {
      module: 'apps/web/lib/identity/pagination.ts',
      symbols: [
        'keysetSql',
        'encodeKeysetCursor',
        'decodeKeysetCursor',
        'buildPage',
        'clampPageSize',
      ],
    },
    collections,
    offsetPagination: [],
    unpagedReads: [],
    loadingMore: {
      module: 'packages/ui/ui/src/primitives/Pagination.tsx',
      symbol: 'PaginationContent',
    },
    ...overrides,
  };
}

function fixture(overrides = {}, files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'pagination-contract-'));
  roots.push(root);
  execFileSync('git', ['-C', root, 'init', '--quiet']);
  write(root, CONTRACT_PATH, JSON.stringify(contract(overrides)));
  write(root, 'apps/web/lib/identity/pagination.ts', HELPERS);
  write(root, 'apps/web/app/api/things/route.ts', KEYSET_ROUTE);
  write(
    root,
    'packages/ui/ui/src/primitives/Pagination.tsx',
    'export function PaginationContent() { return null; }',
  );
  write(root, 'apps/web/features/list/List.tsx', 'export const x = <PaginationContent />;');
  for (const [relativePath, contents] of Object.entries(files)) write(root, relativePath, contents);
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the real guard passes on the repository as it stands', () => {
  const { errors } = checkPaginationContract(REPO_ROOT);
  assert.deepEqual(errors, []);
});

test('a clean tree passes', () => {
  assert.deepEqual(checkPaginationContract(fixture()).errors, []);
});

test('an ordering with no tiebreaker fails', () => {
  const root = fixture(
    {},
    {
      'apps/web/lib/identity/pagination.ts': HELPERS.replace(
        '`order by ${sortColumn} desc, ${idColumn} desc`',
        '`order by ${sortColumn} desc`',
      ),
    },
  );
  const { errors } = checkPaginationContract(root);
  assert.ok(
    errors.some((error) => error.includes('no longer carries a tiebreaker')),
    errors.join('\n'),
  );
});

test('a cursor that is no longer encoded fails', () => {
  const root = fixture(
    {},
    { 'apps/web/lib/identity/pagination.ts': HELPERS.replace("'base64url'", "'utf8'") },
  );
  const { errors } = checkPaginationContract(root);
  assert.ok(
    errors.some((error) => error.includes('no longer encoded')),
    errors.join('\n'),
  );
});

test('a helper the contract names and the module drops fails', () => {
  const root = fixture(
    {},
    {
      'apps/web/lib/identity/pagination.ts': HELPERS.replace(
        'export function buildPage',
        'function buildPage',
      ),
    },
  );
  const { errors } = checkPaginationContract(root);
  assert.ok(
    errors.some((error) => error.includes('no longer exports buildPage')),
    errors.join('\n'),
  );
});

test('a route that pages by offset fails until it is recorded with a fix', () => {
  const offsetRoute = `
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const offset = Number(searchParams.get('offset'));
  return db.query('select 1 limit $1 offset $2', [10, offset]);
}
`;
  const root = fixture({}, { 'apps/web/app/api/ledger/route.ts': offsetRoute });
  const { errors } = checkPaginationContract(root);
  assert.ok(
    errors.some((error) => error.includes('pages by offset')),
    errors.join('\n'),
  );

  const recorded = fixture(
    {
      offsetPagination: [
        {
          route: 'apps/web/app/api/ledger/route.ts',
          why: 'append-only ledger',
          fix: 'use the helpers',
        },
      ],
    },
    { 'apps/web/app/api/ledger/route.ts': offsetRoute },
  );
  assert.deepEqual(checkPaginationContract(recorded).errors, []);

  const silent = fixture(
    { offsetPagination: [{ route: 'apps/web/app/api/ledger/route.ts', why: 'x', fix: '' }] },
    { 'apps/web/app/api/ledger/route.ts': offsetRoute },
  );
  assert.ok(
    checkPaginationContract(silent).errors.some((error) =>
      error.includes('does not say what would close it'),
    ),
  );

  const stale = fixture({
    offsetPagination: [{ route: 'apps/web/app/api/ledger/route.ts', why: 'x', fix: 'y' }],
  });
  assert.ok(
    checkPaginationContract(stale).errors.some((error) =>
      error.includes('no longer pages by offset'),
    ),
  );
});

test('a route that takes a page parameter and pages by nothing fails', () => {
  const root = fixture(
    {},
    {
      'apps/web/app/api/reports/route.ts':
        "export async function GET(request: Request) {\n  const searchParams = new URL(request.url).searchParams;\n  const limit = searchParams.get('limit');\n  return db.query('select 1');\n}",
    },
  );
  const { errors } = checkPaginationContract(root);
  assert.ok(
    errors.some((error) => error.includes('pages by nothing')),
    errors.join('\n'),
  );
});

test('a listed collection with no route, or an unlisted one, fails', () => {
  const missing = contract();
  delete missing.collections.audit;
  const root = fixture({ collections: missing.collections });
  assert.ok(
    checkPaginationContract(root).errors.some((error) =>
      error.includes('"audit" is a listed collection and declares no route'),
    ),
  );

  const extra = contract();
  extra.collections.gossip = { route: 'apps/web/app/api/things/route.ts', why: 'x' };
  const other = fixture({ collections: extra.collections });
  assert.ok(
    checkPaginationContract(other).errors.some((error) =>
      error.includes('"gossip" is not one of the collections'),
    ),
  );
});

test('a loading-more primitive nothing renders fails until the gap is recorded', () => {
  const root = fixture({}, { 'apps/web/features/list/List.tsx': 'export const x = 1;' });
  const { errors } = checkPaginationContract(root);
  assert.ok(
    errors.some((error) => error.includes('is exported and nothing renders it')),
    errors.join('\n'),
  );

  const recorded = fixture(
    {
      loadingMore: {
        module: 'packages/ui/ui/src/primitives/Pagination.tsx',
        symbol: 'PaginationContent',
        gap: { why: 'nothing renders it', fix: 'render it or delete it' },
      },
    },
    { 'apps/web/features/list/List.tsx': 'export const x = 1;' },
  );
  assert.deepEqual(checkPaginationContract(recorded).errors, []);

  const stale = fixture({
    loadingMore: {
      module: 'packages/ui/ui/src/primitives/Pagination.tsx',
      symbol: 'PaginationContent',
      gap: { why: 'nothing renders it', fix: 'render it or delete it' },
    },
  });
  assert.ok(
    checkPaginationContract(stale).errors.some((error) => error.includes('Delete the gap')),
  );
});

test('the paged routes are derived from the route tree, not listed', () => {
  const root = fixture();
  const paged = findPagedRoutes({
    repoRoot: root,
    files: ['apps/web/app/api/things/route.ts'],
    contract: loadContract(root),
  });
  assert.deepEqual(paged, [
    { route: 'apps/web/app/api/things/route.ts', keyset: true, offset: false },
  ]);
});
