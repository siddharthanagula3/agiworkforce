import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { safeResolveWorkspacePath } from '../utils/pathSafety';

const workspace = vscode.workspace as unknown as { workspaceFolders: unknown };

let sandbox: string;
let rootA: string;
let rootB: string;
let outside: string;

function write(file: string, content = 'x'): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

beforeEach(() => {
  sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agi-path-safety-')));
  rootA = path.join(sandbox, 'a');
  rootB = path.join(sandbox, 'b');
  outside = path.join(sandbox, 'outside');
  fs.mkdirSync(rootA);
  fs.mkdirSync(rootB);
  fs.mkdirSync(outside);
  workspace.workspaceFolders = [
    { uri: vscode.Uri.file(rootA), name: 'a', index: 0 },
    { uri: vscode.Uri.file(rootB), name: 'b', index: 1 },
  ];
});

afterEach(() => {
  workspace.workspaceFolders = undefined;
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe('safeResolveWorkspacePath across several roots', () => {
  it('resolves a relative file that exists only in a later root', async () => {
    write(path.join(rootB, 'src', 'only-b.ts'));

    const result = await safeResolveWorkspacePath('src/only-b.ts');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolvedPath).toBe(path.join(rootB, 'src', 'only-b.ts'));
      expect(result.folder.uri.fsPath).toBe(rootB);
    }
  });

  it('prefers the first root when the file exists in both', async () => {
    write(path.join(rootA, 'src', 'both.ts'));
    write(path.join(rootB, 'src', 'both.ts'));

    const result = await safeResolveWorkspacePath('src/both.ts');

    expect(result.ok && result.resolvedPath).toBe(path.join(rootA, 'src', 'both.ts'));
  });

  it('reports a file missing from every root as unavailable', async () => {
    expect(await safeResolveWorkspacePath('src/nowhere.ts')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('keeps an absolute path anchored to the root that owns it', async () => {
    write(path.join(rootB, 'src', 'owned.ts'));

    const result = await safeResolveWorkspacePath(path.join(rootB, 'src', 'owned.ts'), {
      allowAbsolute: true,
    });

    expect(result.ok && result.folder.uri.fsPath).toBe(rootB);
  });

  it('refuses an absolute path outside every root', async () => {
    write(path.join(outside, 'secret.ts'));

    expect(
      await safeResolveWorkspacePath(path.join(outside, 'secret.ts'), { allowAbsolute: true }),
    ).toEqual({ ok: false, reason: 'traversal' });
  });

  it('refuses a credential file in a later root', async () => {
    write(path.join(rootB, '.env'));

    expect(await safeResolveWorkspacePath('.env')).toEqual({ ok: false, reason: 'sensitive' });
  });

  it('refuses a symlink that escapes the root holding it', async () => {
    write(path.join(outside, 'target.ts'));
    fs.mkdirSync(path.join(rootB, 'src'));
    fs.symlinkSync(path.join(outside, 'target.ts'), path.join(rootB, 'src', 'link.ts'));

    expect(await safeResolveWorkspacePath('src/link.ts')).toEqual({
      ok: false,
      reason: 'symlink-escape',
    });
  });

  it('refuses without a workspace', async () => {
    workspace.workspaceFolders = undefined;

    expect(await safeResolveWorkspacePath('src/a.ts')).toEqual({
      ok: false,
      reason: 'no-workspace',
    });
  });
});
