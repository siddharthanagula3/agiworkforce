import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { execFileSync } from 'node:child_process';
import { gitIgnoredPaths } from '../data/contextExclusion';
import {
  buildContextAttachment,
  captureEditorContext,
  resolveEditorContext,
  withholdGitIgnoredContext,
} from '../data/composerContext';

describe('context exclusion at editor and submission boundaries', () => {
  let root: string;
  let folderImplementation: ((uri: vscode.Uri) => vscode.WorkspaceFolder | undefined) | undefined;
  let trusted: boolean;
  let folders: typeof vscode.workspace.workspaceFolders;

  beforeEach(async () => {
    vi.mocked(vscode.languages.getDiagnostics).mockReturnValue([]);
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agi-context-policy-')));
    trusted = vscode.workspace.isTrusted;
    folders = vscode.workspace.workspaceFolders;
    vscode.workspace.workspaceFolders = [
      { name: 'controlled', index: 0, uri: vscode.Uri.file(root) },
    ];
    folderImplementation = vi.mocked(vscode.workspace.getWorkspaceFolder).getMockImplementation();
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockImplementation((uri) =>
      uri.fsPath.startsWith(`${root}${path.sep}`)
        ? { name: 'controlled', index: 0, uri: vscode.Uri.file(root) }
        : undefined,
    );
  });

  afterEach(async () => {
    if (folderImplementation !== undefined) {
      vi.mocked(vscode.workspace.getWorkspaceFolder).mockImplementation(folderImplementation);
    }
    Object.defineProperty(vscode.window, 'activeTextEditor', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(vscode.workspace, 'isTrusted', { configurable: true, value: trusted });
    vscode.workspace.workspaceFolders = folders;
    await fs.rm(root, { recursive: true, force: true });
  });

  function openControlledFile(filePath: string): void {
    Object.defineProperty(vscode.window, 'activeTextEditor', {
      configurable: true,
      value: {
        document: {
          uri: vscode.Uri.file(filePath),
          languageId: 'plaintext',
          isDirty: true,
          isUntitled: false,
          lineCount: 1,
          getText: () => 'CONTROLLED_CREDENTIAL_CONTENT',
        },
        selection: {
          isEmpty: false,
          start: { line: 0, character: 0 },
          end: { line: 0, character: 29 },
          active: { line: 0, character: 29 },
        },
      },
    });
  }

  it('withholds explicit diagnostics from a credential document', async () => {
    const file = path.join(root, '.env');
    await fs.writeFile(file, 'controlled credential');
    openControlledFile(file);
    vi.mocked(vscode.languages.getDiagnostics).mockReturnValue([
      {
        severity: 0,
        message: 'CONTROLLED_CREDENTIAL_CONTENT',
        range: { start: { line: 0, character: 0 } },
      },
    ] as never);

    expect(await buildContextAttachment('problems')).toBeUndefined();
  });

  it('withholds a credential file reached through an ordinary-looking symlink', async () => {
    await fs.writeFile(path.join(root, '.env'), 'CONTROLLED_CREDENTIAL_CONTENT');
    const alias = path.join(root, 'ordinary.txt');
    await fs.symlink('.env', alias);
    openControlledFile(alias);

    const editor = await withholdGitIgnoredContext(
      resolveEditorContext(new Set()),
      async () => false,
    );
    const selection = await buildContextAttachment('selection');

    expect(JSON.stringify(editor)).not.toContain('CONTROLLED_CREDENTIAL_CONTENT');
    expect(selection).toBeUndefined();
  });

  it('rechecks credential identity before sending a previously captured snapshot', async () => {
    const file = path.join(root, 'ordinary.txt');
    await fs.writeFile(file, 'CONTROLLED_CREDENTIAL_CONTENT');
    openControlledFile(file);
    const captured = resolveEditorContext(new Set());
    expect(JSON.stringify(captured)).toContain('CONTROLLED_CREDENTIAL_CONTENT');
    await fs.writeFile(path.join(root, '.env'), 'CONTROLLED_CREDENTIAL_CONTENT');
    await fs.unlink(file);
    await fs.symlink('.env', file);

    const submitted = await withholdGitIgnoredContext(captured, async () => false);

    expect(JSON.stringify(submitted)).not.toContain('CONTROLLED_CREDENTIAL_CONTENT');
    expect(submitted.contextFiles).toEqual([]);
  });

  it('withholds context when git cannot establish ignore status', async () => {
    const file = path.join(root, 'private.txt');
    await fs.writeFile(path.join(root, '.gitignore'), 'private.txt\n');
    await fs.writeFile(file, 'CONTROLLED_CREDENTIAL_CONTENT');

    expect((await gitIgnoredPaths([vscode.Uri.file(file)])).has(file)).toBe(true);
  });

  it('does not treat an untrusted workspace as proof that a file is shareable', async () => {
    const file = path.join(root, 'private.txt');
    await fs.writeFile(file, 'CONTROLLED_CREDENTIAL_CONTENT');
    Object.defineProperty(vscode.workspace, 'isTrusted', { configurable: true, value: false });

    expect((await gitIgnoredPaths([vscode.Uri.file(file)])).has(file)).toBe(true);
  });

  it('does not release cached credential text after its alias changes to an allowed target', async () => {
    execFileSync('git', ['-c', 'init.templateDir=', 'init', '-q'], { cwd: root });
    await fs.writeFile(path.join(root, '.env'), 'CONTROLLED_CREDENTIAL_CONTENT');
    await fs.writeFile(path.join(root, 'allowed.txt'), 'controlled ordinary content');
    const alias = path.join(root, 'alias.txt');
    await fs.symlink('.env', alias);
    openControlledFile(alias);
    const captured = resolveEditorContext(new Set());
    expect(JSON.stringify(captured)).toContain('CONTROLLED_CREDENTIAL_CONTENT');
    await fs.unlink(alias);
    await fs.symlink('allowed.txt', alias);

    const submitted = await withholdGitIgnoredContext(captured);

    expect(JSON.stringify(submitted)).not.toContain('CONTROLLED_CREDENTIAL_CONTENT');
  });

  it('reads allowed alias selections from the canonical document instead of its cached alias buffer', async () => {
    execFileSync('git', ['-c', 'init.templateDir=', 'init', '-q'], { cwd: root });
    const target = path.join(root, 'allowed.txt');
    await fs.writeFile(target, 'controlled ordinary content');
    const alias = path.join(root, 'alias.txt');
    await fs.symlink(target, alias);
    openControlledFile(alias);
    vi.mocked(vscode.workspace.openTextDocument).mockResolvedValueOnce({
      uri: vscode.Uri.file(target),
      languageId: 'plaintext',
      lineCount: 1,
      isDirty: false,
      isUntitled: false,
      getText: () => 'controlled ordinary content',
    } as vscode.TextDocument);

    const captured = await captureEditorContext(new Set());

    expect(JSON.stringify(captured)).not.toContain('CONTROLLED_CREDENTIAL_CONTENT');
    expect(JSON.stringify(captured)).toContain('controlled ordinary content');
    expect(captured.contextFiles).toEqual([target]);
    expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(vscode.Uri.file(target));
  });

  it('pins automatic file inputs to their validated canonical target', async () => {
    execFileSync('git', ['-c', 'init.templateDir=', 'init', '-q'], { cwd: root });
    const target = path.join(root, 'allowed.txt');
    await fs.writeFile(target, 'controlled ordinary content');
    const alias = path.join(root, 'alias.txt');
    await fs.symlink(target, alias);
    openControlledFile(alias);
    const editor = vscode.window.activeTextEditor!;
    Object.defineProperty(editor.document, 'isDirty', { value: false });
    Object.defineProperty(editor.selection, 'isEmpty', { value: true });
    const raw = resolveEditorContext(new Set());
    expect(raw.contextFiles).toEqual([alias]);

    const submitted = await withholdGitIgnoredContext(raw);

    expect(submitted.contextFiles).toEqual([target]);
  });
});
