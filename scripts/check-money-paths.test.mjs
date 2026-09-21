import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import {
  ACCEPTED_HAZARDS,
  REPO_ROOT,
  discoverMoneyPathFiles,
  findMoneyHazards,
  moneyTables,
  scanMoneyPaths,
} from './check-money-paths.mjs';

const GUARD = path.join(REPO_ROOT, 'scripts', 'check-money-paths.mjs');

const sandboxes = [];
after(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
});

function makeSandbox(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'money-paths-'));
  sandboxes.push(dir);
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolute = path.join(dir, relativePath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents, 'utf8');
  }
  return dir;
}

const LEDGER_MIGRATION = `create table if not exists public.sandbox_ledger (
  id uuid primary key,
  amount_microusd bigint not null,
  note text
);
`;

const NON_MONEY_MIGRATION = `create table if not exists public.sandbox_notes (
  id uuid primary key,
  body text not null
);
`;

function sandboxWith(source, migration = LEDGER_MIGRATION) {
  const dir = makeSandbox({
    'apps/web/db/neon/0001_sandbox.sql': migration,
    'apps/web/lib/services/sandbox-writer.ts': source,
  });
  return {
    dir,
    scan: () =>
      scanMoneyPaths({
        repoRoot: dir,
        filePaths: [path.join(dir, 'apps/web/lib/services/sandbox-writer.ts')],
        accepted: [],
      }),
  };
}

const WRITE = `  await db.execute('insert into public.sandbox_ledger (amount_microusd) values ($1)', [amount]);`;

test('the real guard passes on the repository as it stands', () => {
  const result = spawnSync(process.execPath, [GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(
    result.status ?? 0,
    0,
    `check-money-paths failed on the repository:\n${result.stdout}${result.stderr}`,
  );
});

test('money tables are read out of the migrations, not listed', () => {
  const tables = moneyTables(REPO_ROOT);
  assert.ok(tables.includes('credit_transactions'));
  assert.ok(tables.includes('provider_cost_events'));
  assert.ok(tables.includes('organization_billing_invoices'));
  assert.ok(!tables.includes('conversations'));

  const { dir } = sandboxWith(WRITE);
  assert.deepEqual(moneyTables(dir), ['sandbox_ledger']);
});

test('only a module that writes a money column is on the money path', () => {
  const { dir } = sandboxWith(WRITE);
  const onPath = discoverMoneyPathFiles({
    repoRoot: dir,
    filePaths: [path.join(dir, 'apps/web/lib/services/sandbox-writer.ts')],
  });
  assert.equal(onPath.length, 1);

  const other = makeSandbox({
    'apps/web/db/neon/0001_sandbox.sql': NON_MONEY_MIGRATION,
    'apps/web/lib/services/sandbox-writer.ts': WRITE.replace('sandbox_ledger', 'sandbox_notes'),
  });
  assert.equal(
    discoverMoneyPathFiles({
      repoRoot: other,
      filePaths: [path.join(other, 'apps/web/lib/services/sandbox-writer.ts')],
    }).length,
    0,
  );
});

test('a float parser on a money path fails', () => {
  const { scan } = sandboxWith(
    `export function amount(raw: string) {\n  const amountMicrousd = parseFloat(raw);\n${WRITE}\n  return amountMicrousd;\n}\n`,
  );
  const { violations } = scan();
  assert.equal(violations.length, 1);
  assert.equal(violations[0].kind, 'float parser');
});

test('a money value rounded by toFixed fails, while a formatted dollar string does not', () => {
  const { scan } = sandboxWith(
    `export function amount(cents: number) {\n  const rounded = Number(cents.toFixed(2));\n${WRITE}\n  return rounded;\n}\n`,
  );
  assert.equal(scan().violations[0].kind, 'rounded by formatting');

  const display = sandboxWith(
    `export function label(cents: number) {\n  return \`$\${(cents / 100).toFixed(2)}\`;\n}\n${WRITE}\n`,
  );
  assert.deepEqual(
    display.scan().violations.map((entry) => entry.kind),
    [],
  );
});

test('a decimal literal in money arithmetic fails', () => {
  const { scan } = sandboxWith(
    `export function amount(cents: number) {\n  const taxed = cents * 1.0825;\n${WRITE}\n  return taxed;\n}\n`,
  );
  assert.equal(scan().violations[0].kind, 'fractional operand');
});

test('a money quantity scaled by a rate fails unless it resolves the fraction', () => {
  const { scan } = sandboxWith(
    `export function amount(units: number, rateMicrousd: number) {\n  const totalMicrousd = rateMicrousd * units;\n${WRITE}\n  return totalMicrousd;\n}\n`,
  );
  assert.equal(scan().violations[0].kind, 'unrounded rate');

  const rounded = sandboxWith(
    `export function amount(units: number, rateMicrousd: number) {\n  const totalMicrousd = Math.round(rateMicrousd * units);\n${WRITE}\n  return totalMicrousd;\n}\n`,
  );
  assert.deepEqual(
    rounded.scan().violations.map((entry) => entry.kind),
    [],
  );
});

test('a test file is not a money path', () => {
  const dir = makeSandbox({
    'apps/web/db/neon/0001_sandbox.sql': LEDGER_MIGRATION,
    'apps/web/lib/services/sandbox-writer.test.ts': `const amountMicrousd = parseFloat('1');\n${WRITE}\n`,
  });
  assert.equal(
    discoverMoneyPathFiles({
      repoRoot: dir,
      filePaths: [path.join(dir, 'apps/web/lib/services/sandbox-writer.test.ts')],
    }).length,
    0,
  );
});

test('an accepted hazard that no longer matches is reported as stale', () => {
  const dir = makeSandbox({
    'apps/web/db/neon/0001_sandbox.sql': LEDGER_MIGRATION,
    'apps/web/lib/services/sandbox-writer.ts': `export function amount() {\n${WRITE}\n}\n`,
  });
  const { violations, stale } = scanMoneyPaths({
    repoRoot: dir,
    filePaths: [path.join(dir, 'apps/web/lib/services/sandbox-writer.ts')],
    accepted: [
      {
        file: 'apps/web/lib/services/sandbox-writer.ts',
        code: 'const amountMicrousd = parseFloat(raw);',
        reason: 'no longer in the tree',
      },
    ],
  });
  assert.deepEqual(violations, []);
  assert.equal(stale.length, 1);
});

test('every accepted hazard states why the fraction cannot reach a money column', () => {
  assert.ok(ACCEPTED_HAZARDS.length > 0);
  for (const entry of ACCEPTED_HAZARDS) {
    assert.ok(entry.file.length > 0, 'an accepted hazard has to name its file');
    assert.ok(entry.code.trim().length > 0, 'an accepted hazard has to quote the code');
    assert.ok(
      entry.reason.trim().length > 20,
      `accepted hazard in ${entry.file} carries no reason`,
    );
  }
});

test('integer arithmetic inside SQL is not JavaScript floating point', () => {
  const { scan } = sandboxWith(
    'export const SQL = `select amount_cents * 10000 as amount_microusd from public.sandbox_ledger`;\n' +
      `${WRITE}\n`,
  );
  assert.deepEqual(
    scan().violations.map((entry) => entry.kind),
    [],
  );

  const inJs = sandboxWith(
    `export function amount(amountCents: number) {\n  const amountMicrousd = amountCents * 10000;\n${WRITE}\n  return amountMicrousd;\n}\n`,
  );
  assert.equal(inJs.scan().violations[0].kind, 'unrounded rate');
});

test('a violation reports the code as written, not as scanned', () => {
  const { scan } = sandboxWith(
    `export function amount(raw: string) {\n  if (typeof raw === 'string') return parseFloat(raw);\n${WRITE}\n  return 0;\n}\n`,
  );
  assert.equal(scan().violations[0].code, "if (typeof raw === 'string') return parseFloat(raw);");
});

test('findMoneyHazards ignores code inside comments', () => {
  const hazards = findMoneyHazards(
    `// const amountMicrousd = parseFloat(raw);\n/*\n  cents * 1.5\n*/\nconst ok = 1;\n`,
  );
  assert.deepEqual(hazards, []);
});
