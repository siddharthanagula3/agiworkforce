import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guard = path.join(repoRoot, 'scripts/check-web-ui-invariants.mjs');
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

function seedFixture({ source, baselineViolations = [] }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'web-ui-invariants-'));
  fs.mkdirSync(path.join(root, 'apps/web/features'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps/web/features/Fixture.tsx'), source);
  fs.writeFileSync(
    path.join(root, 'scripts/.web-ui-invariants-baseline.json'),
    JSON.stringify({ violations: baselineViolations }),
  );
  return root;
}

function runGuard(root) {
  const result = spawnSync(process.execPath, [guard], { cwd: root, encoding: 'utf8' });
  fs.rmSync(root, { recursive: true, force: true });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

function check(source) {
  return runGuard(seedFixture({ source }));
}

test('clean source passes', () => {
  const { code } = check(
    `export const A = () => <p className="bg-background text-foreground text-sm">ok</p>;\n`,
  );
  assert.equal(code, 0);
});

test('flags a raw palette utility', () => {
  const { code, out } = check(`export const A = () => <p className="bg-amber-500">x</p>;\n`);
  assert.equal(code, 1);
  assert.match(out, /raw-palette/);
  assert.match(out, /bg-amber-500/);
});

test('flags text-white and bg-black', () => {
  const { code, out } = check(`export const A = () => <p className="text-white bg-black">x</p>;\n`);
  assert.equal(code, 1);
  assert.match(out, /raw-bw/);
});

test('flags an arbitrary colour literal but not a tokenised arbitrary value', () => {
  const bad = check(`export const A = () => <p className="bg-[#0d0e18]">x</p>;\n`);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /arbitrary-color/);

  const good = check(`export const A = () => <p className="bg-[hsl(var(--background))]">x</p>;\n`);
  assert.equal(good.code, 0, 'token consumption through an arbitrary value is not hardcoding');
});

test('flags an opacity-diluted foreground token', () => {
  const { code, out } = check(
    `export const A = () => <p className="text-muted-foreground/70">x</p>;\n`,
  );
  assert.equal(code, 1);
  assert.match(out, /opacity-diluted-text/);
});

test('flags type below the legibility floor and allows the floor itself', () => {
  const bad = check(`export const A = () => <p className="text-[11px]">x</p>;\n`);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /tiny-type/);

  const good = check(`export const A = () => <p className="text-[12px]">x</p>;\n`);
  assert.equal(good.code, 0);
});

test('flags an inline fontSize below the floor', () => {
  const { code, out } = check(`export const A = () => <p style={{ fontSize: 9 }}>x</p>;\n`);
  assert.equal(code, 1);
  assert.match(out, /tiny-type-inline/);
});

test('flags an affordance that only appears on hover', () => {
  const { code, out } = check(
    `export const A = () => <button className="opacity-0 group-hover:opacity-100">x</button>;\n`,
  );
  assert.equal(code, 1);
  assert.match(out, /hover-only-affordance/);
});

test('ignores violations inside comments', () => {
  const { code } = check(
    `// bg-amber-500 text-white\n/* text-[9px] */\nexport const A = () => <p className="text-sm">ok</p>;\n`,
  );
  assert.equal(code, 0);
});

test('a baselined violation passes but a second identical one fails', () => {
  const source = `export const A = () => <p className="bg-amber-500">x</p>;\n`;
  const baselined = runGuard(
    seedFixture({
      source,
      baselineViolations: [
        { file: 'apps/web/features/Fixture.tsx', rule: 'raw-palette', literal: 'bg-amber-500' },
      ],
    }),
  );
  assert.equal(baselined.code, 0, 'grandfathered violation should not fail');

  const doubled = runGuard(
    seedFixture({
      source: `export const A = () => <p className="bg-amber-500 bg-amber-500">x</p>;\n`,
      baselineViolations: [
        { file: 'apps/web/features/Fixture.tsx', rule: 'raw-palette', literal: 'bg-amber-500' },
      ],
    }),
  );
  assert.equal(doubled.code, 1, 'a new occurrence beyond the baselined count must fail');
});

test('the guard is registered as a package script and runs in CI', () => {
  assert.equal(
    manifest.scripts['check:web-ui-invariants'],
    'node --test scripts/check-web-ui-invariants.test.mjs && node scripts/check-web-ui-invariants.mjs',
  );
  const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
  assert.match(workflow, /check:web-ui-invariants/);
});
