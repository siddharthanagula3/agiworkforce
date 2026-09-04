/**
 * The colour-literal guard shipped green while scanning zero files: its
 * directory walker recursed and threw the recursion's result away, so the only
 * candidates left were two files that do not exist. A guard that passes on
 * nothing is worse than no guard, because it is quoted as evidence.
 *
 * These tests pin the two properties that failure violated, it reaches real
 * files, and a new literal turns it red.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = join(APP_ROOT, 'scripts', 'check-no-hex-colors.mjs');
const FIXTURE_DIR = join(APP_ROOT, 'src', '__no_hex_guard_fixture__');
const MIN_EXPECTED_FILES = 20;

function runGuard(): { status: number; output: string } {
  try {
    const stdout = execFileSync('node', [GUARD], { cwd: APP_ROOT, encoding: 'utf8' });
    return { status: 0, output: stdout };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? 1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    };
  }
}

afterEach(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

describe('the colour-literal guard actually scans the source tree', () => {
  it('passes on the current tree and reports how many files it reached', () => {
    const { status, output } = runGuard();

    expect(output).toMatch(/scanned (\d+) files/);
    const scanned = Number(/scanned (\d+) files/.exec(output)?.[1]);
    expect(scanned).toBeGreaterThanOrEqual(MIN_EXPECTED_FILES);
    expect(status).toBe(0);
  });

  it('fails on a new literal in a file it has no allowance for', () => {
    mkdirSync(FIXTURE_DIR, { recursive: true });
    writeFileSync(
      join(FIXTURE_DIR, 'violation.ts'),
      "export const FIXTURE_STYLE = 'color: #ff00aa;';\n",
      'utf8',
    );

    const { status, output } = runGuard();

    expect(status).toBe(1);
    expect(output).toContain('#ff00aa');
  });

  it('does not count a hex used as a design-token fallback', () => {
    mkdirSync(FIXTURE_DIR, { recursive: true });
    writeFileSync(
      join(FIXTURE_DIR, 'fallback.ts'),
      "export const FIXTURE_STYLE = 'color: var(--agi-ext-bg, #1a1915);';\n",
      'utf8',
    );

    expect(runGuard().status).toBe(0);
  });
});
