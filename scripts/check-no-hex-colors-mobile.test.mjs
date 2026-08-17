import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guard = path.join(repoRoot, 'scripts/check-no-hex-colors-mobile.mjs');
const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

function seedFixture({ source, baselineViolations }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'no-hex-mobile-'));
  fs.mkdirSync(path.join(root, 'apps/mobile/src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'apps/mobile/scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps/mobile/src/Fixture.tsx'), source);
  fs.writeFileSync(
    path.join(root, 'apps/mobile/scripts/.no-hex-baseline.json'),
    JSON.stringify({ violations: baselineViolations }),
  );
  return root;
}

function runGuard(root) {
  const result = spawnSync(process.execPath, [guard], { cwd: root, encoding: 'utf8' });
  fs.rmSync(root, { recursive: true, force: true });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

test('ci.yml runs the mobile ratchet guard as a real step', () => {
  assert.match(
    workflow,
    /^\s*run: pnpm check:no-hex-mobile\s*$/m,
    'ci.yml has no `run: pnpm check:no-hex-mobile` step, so the mobile baseline enforces nothing',
  );
});

test('the workflow step invokes a script the root manifest defines', () => {
  const script = manifest.scripts['check:no-hex-mobile'] ?? '';

  assert.match(
    script,
    /node scripts\/check-no-hex-colors-mobile\.mjs/,
    'check:no-hex-mobile must run the ratchet guard',
  );
  assert.match(
    script,
    /node --test scripts\/check-no-hex-colors-mobile\.test\.mjs/,
    'check:no-hex-mobile must run this test file, or nothing ever executes it',
  );
});

test('the guard fails on a literal missing from the baseline', () => {
  const { code, out } = runGuard(
    seedFixture({
      source: "export const s = { color: '#123456' };\n",
      baselineViolations: [],
    }),
  );

  assert.equal(code, 1);
  assert.match(out, /apps\/mobile\/src\/Fixture\.tsx:1/);
  assert.match(out, /#123456/);
});

test('the guard passes on a grandfathered literal', () => {
  const { code } = runGuard(
    seedFixture({
      source: "export const s = { color: '#123456' };\n",
      baselineViolations: [
        { file: 'apps/mobile/src/Fixture.tsx', line: 1, literal: '#123456', rule: 'hex' },
      ],
    }),
  );

  assert.equal(code, 0);
});
