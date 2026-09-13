import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  AgiDocumentLinkProvider,
  AgiTerminalLinkProvider,
  OPEN_PATH_REFERENCE_COMMAND,
  openPathReference,
  parsePathReferenceTarget,
  pathReferenceCommandUri,
} from '../features/path-links';
import { safeResolveWorkspacePath } from '../utils/pathSafety';

vi.mock('../utils/pathSafety', () => ({
  safeResolveWorkspacePath: vi.fn(),
}));

const resolveWorkspacePath = vi.mocked(safeResolveWorkspacePath);

function resolvesOnly(...paths: readonly string[]): void {
  resolveWorkspacePath.mockImplementation(async (input: string) =>
    paths.includes(input)
      ? {
          ok: true,
          uri: vscode.Uri.file(`/workspace/${input}`),
          folder: { uri: vscode.Uri.file('/workspace') } as vscode.WorkspaceFolder,
          resolvedPath: `/workspace/${input}`,
        }
      : { ok: false, reason: 'not-in-workspace' },
  );
}

const cancellation = { isCancellationRequested: false } as vscode.CancellationToken;

function fakeDocument(text: string): vscode.TextDocument {
  return {
    getText: () => text,
    positionAt: (offset: number) => new vscode.Position(0, offset),
  } as unknown as vscode.TextDocument;
}

describe('terminal link provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
      type: vscode.FileType.File,
    } as vscode.FileStat);
  });

  it('offers a link only for a reference that resolves inside the workspace', async () => {
    resolvesOnly('src/render-row.ts');
    const line = 'FAIL src/render-row.ts:2:3 and src/absent.ts:4:5';

    const links = await new AgiTerminalLinkProvider().provideTerminalLinks({
      line,
      terminal: undefined as unknown as vscode.Terminal,
    });

    expect(links).toHaveLength(1);
    expect(line.slice(links[0]!.startIndex, links[0]!.startIndex + links[0]!.length)).toBe(
      'src/render-row.ts:2:3',
    );
    expect(links[0]?.target).toEqual({ path: 'src/render-row.ts', line: 2, column: 3 });
    expect(links[0]?.tooltip).toBe('Open src/render-row.ts:2:3');
  });

  it('offers no link when nothing on the line resolves', async () => {
    resolvesOnly();

    const links = await new AgiTerminalLinkProvider().provideTerminalLinks({
      line: 'at handler (/elsewhere/other.ts:9:1)',
      terminal: undefined as unknown as vscode.Terminal,
    });

    expect(links).toEqual([]);
  });

  it('refuses a reference the sensitive-file boundary rejects', async () => {
    resolveWorkspacePath.mockResolvedValue({ ok: false, reason: 'sensitive' });

    const links = await new AgiTerminalLinkProvider().provideTerminalLinks({
      line: 'loaded config/.env.local:1',
      terminal: undefined as unknown as vscode.Terminal,
    });

    expect(links).toEqual([]);
  });
});

describe('document link provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
      type: vscode.FileType.File,
    } as vscode.FileStat);
  });

  it('targets the open command with the parsed position', async () => {
    resolvesOnly('src/app.ts');

    const links = await new AgiDocumentLinkProvider().provideDocumentLinks(
      fakeDocument('see src/app.ts:14:2 now'),
      cancellation,
    );

    expect(links).toHaveLength(1);
    expect(links[0]?.target?.toString()).toBe(
      pathReferenceCommandUri({ path: 'src/app.ts', line: 14, column: 2 }).toString(),
    );
  });

  it('resolves each distinct path once however often it appears', async () => {
    resolvesOnly('src/app.ts');

    const links = await new AgiDocumentLinkProvider().provideDocumentLinks(
      fakeDocument('src/app.ts:1 src/app.ts:2 src/app.ts:3'),
      cancellation,
    );

    expect(links).toHaveLength(3);
    expect(resolveWorkspacePath).toHaveBeenCalledTimes(1);
  });
});

describe('openPathReference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({
      type: vscode.FileType.File,
    } as vscode.FileStat);
  });

  it('refuses a payload that is not a path reference', async () => {
    expect(parsePathReferenceTarget({ path: 42 })).toBeUndefined();
    expect(parsePathReferenceTarget({ path: 'a.ts', line: -3 })).toEqual({ path: 'a.ts' });
    expect(await openPathReference({ nope: true })).toBe(false);
    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
  });

  it('warns instead of opening when the path leaves the workspace', async () => {
    resolvesOnly();

    expect(await openPathReference({ path: '../../etc/hosts' })).toBe(false);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledOnce();
    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
  });

  it('builds a command URI that round-trips the reference', () => {
    const uri = pathReferenceCommandUri({ path: 'src/a.ts', line: 4 });
    const [, encoded] = uri.toString().split('?');

    expect(uri.toString()).toContain(OPEN_PATH_REFERENCE_COMMAND);
    expect(JSON.parse(decodeURIComponent(encoded ?? ''))).toEqual([{ path: 'src/a.ts', line: 4 }]);
  });
});
