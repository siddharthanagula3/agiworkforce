import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(root, 'scripts/check-native-module-tracing.mjs');
const CONFIG = path.join(root, 'apps/web/next.config.ts');

/**
 * Run the real check against a temporarily modified next.config.ts.
 *
 * The check reads the actual pnpm store and the actual web sources, so these
 * exercise the same code path CI runs rather than a stubbed approximation.
 * The config is always restored, including on failure.
 */
function withConfig(transform) {
  const original = fs.readFileSync(CONFIG, 'utf8');
  const backup = path.join(os.tmpdir(), `next.config.${process.pid}.bak.ts`);
  fs.writeFileSync(backup, original);
  try {
    fs.writeFileSync(CONFIG, transform(original));
    try {
      execFileSync('node', [SCRIPT], { cwd: root, stdio: 'pipe' });
      return { ok: true, output: '' };
    } catch (error) {
      return {
        ok: false,
        output: `${error.stdout ?? ''}${error.stderr ?? ''}`,
      };
    }
  } finally {
    fs.writeFileSync(CONFIG, fs.readFileSync(backup, 'utf8'));
    fs.rmSync(backup, { force: true });
  }
}

test('passes on the committed configuration', () => {
  const result = withConfig((s) => s);
  assert.ok(result.ok, `check should pass as committed:\n${result.output}`);
});

test('fails when serverExternalPackages loses the native package', () => {
  const result = withConfig((s) => s.replace("  serverExternalPackages: ['argon2'],\n", ''));
  assert.ok(!result.ok, 'removing serverExternalPackages must fail the check');
  assert.match(result.output, /serverExternalPackages/);
});

test('fails when outputFileTracingIncludes loses the native package', () => {
  // THE REGRESSION THIS TEST EXISTS FOR. The first version of the check passed
  // here, because `outputFileTracingIncludes` also appears in the doc comment
  // above the config and `argon2` fell inside the search window — the guard
  // was matching prose, not configuration. This is the half-fix that still
  // 500s in production, so it has to fail.
  const result = withConfig((s) => s.replace(/ {2}outputFileTracingIncludes: \{\n[^}]*\},\n/, ''));
  assert.ok(!result.ok, 'removing outputFileTracingIncludes must fail the check');
  assert.match(result.output, /outputFileTracingIncludes/);
});

test('fails when both declarations are absent, as they were during the outage', () => {
  const result = withConfig((s) =>
    s
      .replace("  serverExternalPackages: ['argon2'],\n", '')
      .replace(/ {2}outputFileTracingIncludes: \{\n[^}]*\},\n/, ''),
  );
  assert.ok(!result.ok, 'the pre-outage configuration must fail the check');
});

test('reports which files import the native package, so the fix is actionable', () => {
  const result = withConfig((s) => s.replace("  serverExternalPackages: ['argon2'],\n", ''));
  assert.match(result.output, /Imported by:/);
  assert.match(result.output, /api-key-service\.ts/);
});
