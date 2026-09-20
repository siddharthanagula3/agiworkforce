import { execFileSync, execSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(WEB_ROOT, '../..');

// `err instanceof Error ? err.message : fallback` looks careful and is not: a
// dropped connection throws a TypeError, so the branch is TRUE and the screen
// shows the browser's own wording, "Failed to fetch", "Load failed". That read
// as "Save failed: Failed to fetch" across every settings section. Use
// toUserMessage(), which keeps real server messages and names network failures.
describe('user-facing components do not render raw error messages', () => {
  it('has no raw error message reaching a user-facing state or notification sink', () => {
    const output = execFileSync(process.execPath, ['scripts/check-raw-error-to-user.mjs'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(output).toContain('Raw-error-to-user check passed');
  }, 35_000);

  it('is not vacuous, the helper it points at is widely used', () => {
    const users = execSync("grep -rl 'toUserMessage' --include='*.tsx' features app | wc -l", {
      cwd: WEB_ROOT,
      encoding: 'utf8',
    }).trim();
    expect(Number(users)).toBeGreaterThan(20);
  });
});
