/**
 * file_edit integration tests — exercises the api-gateway tool wrapper
 * around `@agiworkforce/apply-patch`.
 *
 * Validates that:
 *   - happy path: a valid Add patch creates a file and reports success
 *   - workspace-escape: relative `../escape.txt` is rejected with code
 *     `'workspace_escape'`
 *   - blocklist: `/etc` as workspace root is rejected
 *   - invalid input: missing patch returns `'invalid_input'`
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyFileEdit } from '../file_edit';

describe('applyFileEdit (api-gateway)', () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'agi-file-edit-'));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it('applies an Add patch to a file inside the workspace', async () => {
    const patch =
      '*** Begin Patch\n' + '*** Add File: hello.txt\n' + '+hello world\n' + '*** End Patch\n';
    const result = await applyFileEdit({ patch, workspaceRoot: workspace });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.summary.added).toEqual(['hello.txt']);
    }
    const content = await readFile(join(workspace, 'hello.txt'), 'utf-8');
    expect(content).toBe('hello world');
  });

  it('rejects workspace-escape via relative parent traversal', async () => {
    const patch =
      '*** Begin Patch\n' + '*** Add File: ../escape.txt\n' + '+pwn\n' + '*** End Patch\n';
    const result = await applyFileEdit({ patch, workspaceRoot: workspace });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('workspace_escape');
    }
  });

  it('rejects system-sensitive workspace roots', async () => {
    const patch = '*** Begin Patch\n' + '*** Add File: tmpfile\n' + '+x\n' + '*** End Patch\n';
    const result = await applyFileEdit({ patch, workspaceRoot: '/etc' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('workspace_escape');
    }
  });

  it('rejects missing patch', async () => {
    const result = await applyFileEdit({ patch: '', workspaceRoot: workspace });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('invalid_input');
    }
  });
});
