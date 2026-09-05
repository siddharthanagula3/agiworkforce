import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  BILLING_CATALOG_OWNER_PATH,
  OWNER_PATHS,
  REPO_ROOT,
  findRawTierComparisons,
  scanTierPredicateFiles,
} from './check-plan-tier-predicates.mjs';

const GUARD = path.join(REPO_ROOT, 'scripts', 'check-plan-tier-predicates.mjs');

const sandboxes = [];
function makeSandbox(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'plan-tier-'));
  sandboxes.push(dir);
  for (const [rel, contents] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, contents, 'utf8');
  }
  return dir;
}
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `expected clean repo, got:\n${result.stderr}${result.stdout}`);
});

test('billing-catalog.ts is exempt from its own guard', () => {
  assert.ok(OWNER_PATHS.some((entry) => entry.file === BILLING_CATALOG_OWNER_PATH));
});

test('flags a raw comparison against a tier-named identifier', () => {
  const hits = findRawTierComparisons("if (billing.plan_tier === 'free') return false;\n");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 1);
});

test('flags a raw comparison chained through a normalizer call', () => {
  const hits = findRawTierComparisons(
    "const isFree = subscription.plan_tier.toLowerCase() === 'free';\n",
  );
  assert.equal(hits.length, 1);
});

test('flags the reverse-order literal-then-identifier form', () => {
  const hits = findRawTierComparisons("if ('enterprise' === currentTier) return true;\n");
  assert.equal(hits.length, 1);
});

test('ignores a same-spelled literal compared against an unrelated identifier', () => {
  const hits = findRawTierComparisons("if (status === 'free') return true;\n");
  assert.equal(hits.length, 0);
});

test('ignores comment lines', () => {
  const hits = findRawTierComparisons("// legacy: billing.plan_tier === 'free'\n");
  assert.equal(hits.length, 0);
});

test('ignores a string that is not one of the nine billing plan tiers', () => {
  const hits = findRawTierComparisons("if (currentTier === 'hobby') return true;\n");
  assert.equal(hits.length, 0);
});

test('scanTierPredicateFiles fails on a new raw comparison in an unlisted apps/web file', () => {
  const sandbox = makeSandbox({
    'apps/web/lib/example.ts': "export const isFree = (planTier: string) => planTier === 'free';\n",
  });
  const violations = scanTierPredicateFiles({
    repoRoot: sandbox,
    filePaths: [path.join(sandbox, 'apps/web/lib/example.ts')],
  });
  assert.equal(violations.length, 1);
  assert.equal(violations[0].file, 'apps/web/lib/example.ts');
});

test('scanTierPredicateFiles exempts every declared owner path', () => {
  const sandbox = makeSandbox({
    'apps/web/lib/free-trial-config.ts':
      "export const x = tierPolicy.minTier === 'free' ? 1 : 0;\n",
  });
  const violations = scanTierPredicateFiles({
    repoRoot: sandbox,
    filePaths: [path.join(sandbox, 'apps/web/lib/free-trial-config.ts')],
  });
  assert.equal(violations.length, 0);
});

test('scanTierPredicateFiles ignores files outside the configured scan roots', () => {
  const sandbox = makeSandbox({
    'apps/desktop/src/lib/example.ts': "export const isFree = (t: string) => t.plan === 'free';\n",
  });
  const violations = scanTierPredicateFiles({
    repoRoot: sandbox,
    filePaths: [path.join(sandbox, 'apps/desktop/src/lib/example.ts')],
  });
  assert.equal(violations.length, 0);
});

test('scanTierPredicateFiles ignores test files', () => {
  const sandbox = makeSandbox({
    'apps/web/lib/example.test.ts': "test('x', () => { expect(tier === 'free').toBe(true); });\n",
  });
  const violations = scanTierPredicateFiles({
    repoRoot: sandbox,
    filePaths: [path.join(sandbox, 'apps/web/lib/example.test.ts')],
  });
  assert.equal(violations.length, 0);
});
