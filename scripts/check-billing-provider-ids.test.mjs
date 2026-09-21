import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  ADAPTER_PATHS,
  MOBILE_BUNDLE_ID,
  REPO_ROOT,
  findProviderIdLiterals,
  scanProviderIdFiles,
} from './check-billing-provider-ids.mjs';

const GUARD = path.join(REPO_ROOT, 'scripts', 'check-billing-provider-ids.mjs');

// Built rather than written, so this file never contains a literal that
// secret scanning or this very guard would have to make an exception for.
const STRIPE_PRICE_LITERAL = ['price', 'ExampleAbCd1234'].join('_');
const STRIPE_PRODUCT_LITERAL = ['prod', 'ExampleAbCd1234'].join('_');
const STORE_PRODUCT_LITERAL = `${MOBILE_BUNDLE_ID}.subscription.pro.monthly`;

const sandboxes = [];
function makeSandbox(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'provider-ids-'));
  sandboxes.push(dir);
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolute = path.join(dir, relativePath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents, 'utf8');
  }
  return dir;
}
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

function scanSandbox(dir, files) {
  return scanProviderIdFiles({
    repoRoot: dir,
    filePaths: files.map((relativePath) => path.join(dir, relativePath)),
  });
}

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(
    result.status ?? 0,
    0,
    `expected a clean repo, got:\n${result.stderr}${result.stdout}`,
  );
});

test('every adapter the guard exempts still exists', () => {
  const result = spawnSync(
    'git',
    ['-C', REPO_ROOT, 'ls-files', '--error-unmatch', ...ADAPTER_PATHS.map((entry) => entry.file)],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
});

test('flags a hardcoded Stripe price id', () => {
  const hits = findProviderIdLiterals(`const plan = tierFor('${STRIPE_PRICE_LITERAL}');\n`);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].provider, 'stripe');
  assert.equal(hits[0].kind, 'price id');
});

test('flags a hardcoded Stripe product id', () => {
  const hits = findProviderIdLiterals(
    `if (id === '${STRIPE_PRODUCT_LITERAL}') return 'enterprise';\n`,
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0].kind, 'product id');
});

test('flags a hardcoded store product id', () => {
  const hits = findProviderIdLiterals(`const sku = '${STORE_PRODUCT_LITERAL}';\n`);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].provider, 'apple or google');
});

test('leaves the configuration variable names the adapters read alone', () => {
  assert.deepEqual(
    findProviderIdLiterals("process.env['STRIPE_PRICE_PRO_MONTHLY'];\nconst id = priceId;\n"),
    [],
  );
});

test('scans a product file and exempts the adapters', () => {
  const files = {
    'apps/web/lib/services/checkout.ts': `export const plan = '${STRIPE_PRICE_LITERAL}';\n`,
    'apps/web/lib/price-tier-mapping.ts': `export const fallback = '${STRIPE_PRICE_LITERAL}';\n`,
  };
  const dir = makeSandbox(files);
  const violations = scanSandbox(dir, Object.keys(files));

  assert.equal(violations.length, 1);
  assert.equal(violations[0].file, 'apps/web/lib/services/checkout.ts');
});

test('leaves a test fixture alone, where a synthetic id is the point', () => {
  const files = {
    'apps/web/lib/__tests__/checkout.test.ts': `expect(tier('${STRIPE_PRICE_LITERAL}')).toBe('pro');\n`,
  };
  const dir = makeSandbox(files);

  assert.deepEqual(scanSandbox(dir, Object.keys(files)), []);
});

test('exits non-zero on a synthetic violation', () => {
  const files = {
    'apps/web/lib/services/checkout.ts': `export const plan = '${STRIPE_PRICE_LITERAL}';\n`,
  };
  const dir = makeSandbox(files);
  spawnSync('git', ['-C', dir, 'init', '-q'], { encoding: 'utf8' });

  const result = spawnSync(process.execPath, [GUARD, dir], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /apps\/web\/lib\/services\/checkout\.ts:1/);
  assert.match(result.stderr, /stripe price id/);
});
