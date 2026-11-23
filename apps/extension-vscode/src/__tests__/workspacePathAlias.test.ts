import { mkdtempSync, mkdirSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { isSameWorkspacePath } from '../integrations/developerSessionValidation';

it('recognizes an existing folder alias and keeps different workspace roots separate', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'agi-path-'));
  try {
    const workspace = path.join(temp, 'project');
    const sibling = path.join(temp, 'other');
    const alias = path.join(temp, 'alias');
    mkdirSync(workspace);
    mkdirSync(sibling);
    symlinkSync(workspace, alias, 'junction');
    expect(isSameWorkspacePath(alias, realpathSync.native(workspace))).toBe(true);
    expect(isSameWorkspacePath(alias, sibling)).toBe(false);
    expect(isSameWorkspacePath(alias, 'project')).toBe(false);
    expect(isSameWorkspacePath(alias, path.join(temp, 'missing'))).toBe(false);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
