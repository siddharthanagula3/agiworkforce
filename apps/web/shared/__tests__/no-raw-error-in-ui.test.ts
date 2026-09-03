import { execSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = path.resolve(__dirname, '../..');

describe('user-facing components do not render raw error messages', () => {
  it('has no remaining instanceof-Error message extraction in rendered code', () => {
    const found = execSync(
      "grep -rn 'instanceof Error ?' --include='*.tsx' features app shared | grep -v '\\.test\\.' || true",
      { cwd: WEB_ROOT, encoding: 'utf8' },
    ).trim();
    expect(found, `use toUserMessage() instead:\n${found}`).toBe('');
  });

  it('is not vacuous, the helper it points at is widely used', () => {
    const users = execSync("grep -rl 'toUserMessage' --include='*.tsx' features app | wc -l", {
      cwd: WEB_ROOT,
      encoding: 'utf8',
    }).trim();
    expect(Number(users)).toBeGreaterThan(20);
  });
});
