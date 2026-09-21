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

const REASON =
  'Grandfathered by the fixture so the ratchet has something to shrink, and owed a token.';

function seedFixture({ source, stylesheet, baselineViolations = [], baselineReasons }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'web-ui-invariants-'));
  fs.mkdirSync(path.join(root, 'apps/web/features'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps/web/features/Fixture.tsx'), source);
  if (stylesheet !== undefined) {
    fs.writeFileSync(path.join(root, 'apps/web/features/fixture.css'), stylesheet);
  }
  const reasons =
    baselineReasons ??
    Object.fromEntries(baselineViolations.map((violation) => [violation.rule, REASON]));
  fs.writeFileSync(
    path.join(root, 'scripts/.web-ui-invariants-baseline.json'),
    JSON.stringify({ _reasons: reasons, violations: baselineViolations }),
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

test('flags a stylesheet font-size below the floor, and reads stylesheets for nothing else', () => {
  const bad = runGuard(
    seedFixture({
      source: 'export const A = () => null;\n',
      stylesheet: '.eyebrow { font-size: 11px; color: #ffffff; }\n.body { font-size: 12px; }\n',
    }),
  );
  assert.equal(bad.code, 1);
  assert.match(bad.out, /tiny-type-css/);
  assert.doesNotMatch(bad.out, /raw-bw|arbitrary-color/);

  const good = runGuard(
    seedFixture({
      source: 'export const A = () => null;\n',
      stylesheet: '.body { font-size: 12px; }\n',
    }),
  );
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

test('flags a bare stacking rung and allows a token rung', () => {
  const bad = check(`export const A = () => <div className="fixed z-[9999]" />;\n`);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /arbitrary-z-index/);

  const good = check(`export const A = () => <div className="fixed z-[var(--z-modal,300)]" />;\n`);
  assert.equal(good.code, 0);
});

test('flags a bare z-index in a stylesheet', () => {
  const { code, out } = runGuard(
    seedFixture({
      source: 'export const A = () => null;\n',
      stylesheet: '.overlay { z-index: 70; }\n',
    }),
  );
  assert.equal(code, 1);
  assert.match(out, /arbitrary-z-index-css/);
});

test('flags outline-none with no focus replacement and allows one that has it', () => {
  const bad = check(`export const A = () => <input className="outline-none border" />;\n`);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /outline-none-without-focus-ring/);

  const good = check(
    `export const A = () => (\n  <input\n    className="outline-none"\n  />\n);\nexport const B = 'focus-visible:ring-2';\n`,
  );
  assert.equal(good.code, 0, 'a replacement within the element is the whole point of the rule');
});

test('flags a new tab opened without noopener, across the lines of the element', () => {
  const bad = check(
    `export const A = () => (\n  <a\n    href="https://example.com"\n    target="_blank"\n  >\n    x\n  </a>\n);\n`,
  );
  assert.equal(bad.code, 1);
  assert.match(bad.out, /unsafe-blank-target/);

  const good = check(
    `export const A = () => (\n  <a\n    href="https://example.com"\n    target="_blank"\n    rel="noopener noreferrer"\n  >\n    x\n  </a>\n);\n`,
  );
  assert.equal(good.code, 0);
});

test('flags a click handler on a non-interactive element unless it carries semantics', () => {
  const bad = check(`export const A = () => <div onClick={() => undefined}>x</div>;\n`);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /clickable-div-without-semantics/);

  const good = check(
    `export const A = () => (\n  <div role="button" tabIndex={0} onClick={() => undefined}>\n    x\n  </div>\n);\n`,
  );
  assert.equal(good.code, 0);

  const button = check(`export const A = () => <button onClick={() => undefined}>x</button>;\n`);
  assert.equal(button.code, 0);
});

test('a baselined rule with no reason fails, so the list cannot become an allowlist', () => {
  const { code, out } = runGuard(
    seedFixture({
      source: `export const A = () => <p className="bg-amber-500">x</p>;\n`,
      baselineViolations: [
        { file: 'apps/web/features/Fixture.tsx', rule: 'raw-palette', literal: 'bg-amber-500' },
      ],
      baselineReasons: { 'raw-palette': 'legacy' },
    }),
  );
  assert.equal(code, 1);
  assert.match(out, /carry no reason/);
});

test('every rule the shipped baseline grandfathers carries a reason', () => {
  const baseline = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'scripts/.web-ui-invariants-baseline.json'), 'utf8'),
  );
  const rules = new Set(baseline.violations.map((violation) => violation.rule));
  for (const rule of rules) {
    assert.ok(
      (baseline._reasons?.[rule] ?? '').trim().length >= 60,
      `${rule} is baselined with no reason`,
    );
  }
});

test('the guard is registered as a package script and runs in CI', () => {
  assert.equal(
    manifest.scripts['check:web-ui-invariants'],
    'node --test scripts/check-web-ui-invariants.test.mjs && node scripts/check-web-ui-invariants.mjs',
  );
  const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
  assert.match(workflow, /check:web-ui-invariants/);
});
