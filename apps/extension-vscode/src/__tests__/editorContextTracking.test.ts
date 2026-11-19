import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import * as path from 'node:path';
import {
  ChatStateManager,
  type ExtToWebviewMessage,
} from '../features/sidebar-webview/ChatStateManager';
import { workspaceFileFixture } from './workspaceFileFixture';

type ChildProcessModule = typeof import('node:child_process');

const gitRuns = vi.hoisted(() => ({ count: 0 }));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<ChildProcessModule>();
  return {
    ...actual,
    execFile: ((...args: Parameters<ChildProcessModule['execFile']>) => {
      if (args[0] === 'git') gitRuns.count += 1;
      return actual.execFile(...args);
    }) as ChildProcessModule['execFile'],
  };
});

type SelectionListener = (event: vscode.TextEditorSelectionChangeEvent) => void;

let fixture: Awaited<ReturnType<typeof workspaceFileFixture>> | undefined;
const selectionListeners = new Set<SelectionListener>();

function openEditor(root: string): void {
  vscode.window.activeTextEditor = {
    selection: {
      isEmpty: true,
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
      active: { line: 0, character: 0 },
    },
    document: {
      uri: vscode.Uri.file(path.join(root, 'src/app.ts')),
      languageId: 'typescript',
      lineCount: 1,
      isDirty: false,
      isUntitled: false,
      getText: () => '',
    },
  } as unknown as vscode.TextEditor;
}

function moveCursor(times: number): void {
  for (let index = 0; index < times; index += 1) {
    for (const listener of selectionListeners) {
      listener({} as vscode.TextEditorSelectionChangeEvent);
    }
  }
}

function newManager(posted: ExtToWebviewMessage[]): ChatStateManager {
  const context = new vscode.ExtensionContext();
  return new ChatStateManager(
    context.secrets,
    context,
    (message) => posted.push(message),
    undefined,
    context.workspaceState,
  );
}

const editorContextPosts = (posted: ExtToWebviewMessage[]) =>
  posted.filter((message) => message.type === 'editorContext').length;

beforeEach(async () => {
  vi.clearAllMocks();
  gitRuns.count = 0;
  selectionListeners.clear();
  vi.mocked(vscode.window.onDidChangeTextEditorSelection).mockImplementation(((
    listener: SelectionListener,
  ) => {
    selectionListeners.add(listener);
    return new vscode.Disposable(() => selectionListeners.delete(listener));
  }) as never);
  vi.mocked(vscode.languages.getDiagnostics).mockReturnValue([] as never);
  fixture = await workspaceFileFixture(['src/app.ts']);
  const root = fixture.root;
  vi.mocked(vscode.workspace.asRelativePath).mockImplementation((value: unknown) =>
    String((value as { fsPath?: string }).fsPath ?? value).replace(`${root}${path.sep}`, ''),
  );
  vscode.workspace.isTrusted = true;
  openEditor(root);
});

afterEach(async () => {
  vscode.window.activeTextEditor = undefined;
  await fixture?.dispose();
  fixture = undefined;
});

describe('editor context chips', () => {
  it('does no work for cursor moves before a chat view has talked to the extension', async () => {
    const posted: ExtToWebviewMessage[] = [];
    const manager = newManager(posted);

    moveCursor(20);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(selectionListeners.size).toBe(0);
    expect(gitRuns.count).toBe(0);
    expect(editorContextPosts(posted)).toBe(0);
    manager.dispose();
  });

  it('settles a burst of cursor moves into one refresh and one git check', async () => {
    const posted: ExtToWebviewMessage[] = [];
    const manager = newManager(posted);
    await manager.handleMessage({
      type: 'composerState',
      payload: { instance: 'composer-1', revision: 0, attachments: 0 },
    });

    moveCursor(20);
    await vi.waitFor(() => expect(editorContextPosts(posted)).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(editorContextPosts(posted)).toBe(1);
    expect(gitRuns.count).toBe(1);

    moveCursor(1);
    await vi.waitFor(() => expect(editorContextPosts(posted)).toBe(2));
    expect(gitRuns.count).toBe(1);
    manager.dispose();
  });

  it('stops listening while the chat view is hidden', async () => {
    const posted: ExtToWebviewMessage[] = [];
    const manager = newManager(posted);
    await manager.handleMessage({
      type: 'composerState',
      payload: { instance: 'composer-1', revision: 0, attachments: 0 },
    });
    expect(selectionListeners.size).toBe(1);

    manager.setEditorContextTracking(false);
    moveCursor(5);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(selectionListeners.size).toBe(0);
    expect(editorContextPosts(posted)).toBe(0);
    manager.dispose();
  });
});
