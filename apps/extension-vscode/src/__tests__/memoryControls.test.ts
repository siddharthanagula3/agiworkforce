import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { setupCommands, type CommandDeps } from '../core/commandSetup';
import { MEMORY_STORE_KEY, loadFacts } from '../memory/memoryStore';

type Handler = (...args: unknown[]) => unknown;

function makeWorkspaceState() {
  const store = new Map<string, unknown>();
  return {
    get: <T>(key: string): T | undefined => store.get(key) as T | undefined,
    update: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    keys: () => [...store.keys()] as readonly string[],
  };
}

function mockConfiguration(values: Record<string, unknown>): {
  update: ReturnType<typeof vi.fn>;
} {
  const update = vi.fn(async (key: string, value: unknown) => {
    values[key] = value;
  });
  vi.mocked(vscode.workspace.getConfiguration).mockImplementation(
    () =>
      ({
        get: vi.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
        update,
        has: vi.fn().mockReturnValue(true),
        inspect: vi.fn((key: string) => ({ key, globalValue: values[key] })),
      }) as unknown as vscode.WorkspaceConfiguration,
  );
  return { update };
}

function registerMemoryCommands(workspaceState: ReturnType<typeof makeWorkspaceState>): {
  handlers: Map<string, Handler>;
  refresh: ReturnType<typeof vi.fn>;
} {
  const handlers = new Map<string, Handler>();
  vi.mocked(vscode.commands.registerCommand).mockImplementation(((id: string, handler: Handler) => {
    handlers.set(id, handler);
    return new vscode.Disposable(() => undefined);
  }) as never);

  const refresh = vi.fn();
  const stub = new Proxy({}, { get: () => vi.fn() });
  setupCommands(
    {
      subscriptions: [],
      secrets: {
        get: vi.fn().mockResolvedValue(undefined),
        store: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        onDidChange: vi.fn(),
      },
      workspaceState,
    } as unknown as vscode.ExtensionContext,
    {
      sidebarProvider: stub,
      conversationTreeProvider: stub,
      localRuntimes: stub,
      contextPanelProvider: stub,
      memoryTreeProvider: { refresh } as unknown as CommandDeps['memoryTreeProvider'],
      diffDecorationProvider: stub,
      diagnosticsProvider: stub,
      nativeChatAvailable: false,
    } as unknown as CommandDeps,
  );

  return { handlers, refresh };
}

describe('API key entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscode.workspace.isTrusted = true;
    vscode.workspace.workspaceFolders = [
      { name: 'workspace', index: 0, uri: vscode.Uri.file('/workspace') },
    ];
  });

  it('refuses an empty key at the prompt instead of storing whitespace', async () => {
    const { handlers } = registerMemoryCommands(makeWorkspaceState());
    const showInputBox = vi.mocked(vscode.window.showInputBox);
    showInputBox.mockResolvedValue(undefined);

    await handlers.get('agi-workforce.setApiKey')?.();

    const validate = showInputBox.mock.calls[0]?.[0]?.validateInput;
    expect(validate).toBeTypeOf('function');
    expect(validate?.('', {} as never)).toBe('API key cannot be empty.');
    expect(validate?.('   ', {} as never)).toBe('API key cannot be empty.');
    expect(validate?.('sk-agi-test-123', {} as never)).toBeUndefined();
  });
});

describe('memory enable/disable controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscode.workspace.isTrusted = true;
    vscode.workspace.workspaceFolders = [
      { name: 'workspace', index: 0, uri: vscode.Uri.file('/workspace') },
    ];
  });

  it('captures nothing while memory is off and the user declines to turn it on', async () => {
    const values: Record<string, unknown> = { 'memory.enabled': false };
    mockConfiguration(values);
    const workspaceState = makeWorkspaceState();
    const { handlers } = registerMemoryCommands(workspaceState);
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined as never);
    const showInputBox = vi.mocked(vscode.window.showInputBox);
    showInputBox.mockResolvedValue('I prefer Rust');

    await handlers.get('agi-workforce.memory.create')?.();

    expect(showInputBox).not.toHaveBeenCalled();
    expect(loadFacts(workspaceState)).toHaveLength(0);
    expect(vi.mocked(vscode.window.showWarningMessage).mock.calls[0]?.[0]).toContain(
      'Memory is off',
    );
  });

  it('turns memory on from the capture prompt and then stores the fact', async () => {
    const values: Record<string, unknown> = { 'memory.enabled': false };
    const { update } = mockConfiguration(values);
    const workspaceState = makeWorkspaceState();
    const { handlers } = registerMemoryCommands(workspaceState);
    vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Turn memory on' as never);
    vi.mocked(vscode.window.showInputBox).mockResolvedValue('I prefer Rust');

    await handlers.get('agi-workforce.memory.create')?.();

    expect(update).toHaveBeenCalledWith('memory.enabled', true, expect.anything());
    expect(loadFacts(workspaceState).map((fact) => fact.text)).toEqual(['I prefer Rust']);
  });

  it('toggles the setting both ways and refreshes the memory view', async () => {
    const values: Record<string, unknown> = { 'memory.enabled': true };
    const { update } = mockConfiguration(values);
    const workspaceState = makeWorkspaceState();
    const { handlers, refresh } = registerMemoryCommands(workspaceState);

    await handlers.get('agi-workforce.memory.toggle')?.();
    expect(update).toHaveBeenLastCalledWith('memory.enabled', false, expect.anything());
    expect(refresh).toHaveBeenCalled();

    await handlers.get('agi-workforce.memory.toggle')?.();
    expect(update).toHaveBeenLastCalledWith('memory.enabled', true, expect.anything());
  });

  it('keeps stored facts readable while memory is off', async () => {
    const values: Record<string, unknown> = { 'memory.enabled': false };
    mockConfiguration(values);
    const workspaceState = makeWorkspaceState();
    await workspaceState.update(MEMORY_STORE_KEY, [
      { id: 'mem_1', text: 'Prefer Rust', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    const { handlers } = registerMemoryCommands(workspaceState);
    const showQuickPick = vi.mocked(vscode.window.showQuickPick);
    showQuickPick.mockResolvedValue({ detail: 'list' } as never);

    await handlers.get('agi-workforce.memory')?.();

    expect(showQuickPick.mock.calls[1]?.[0]).toEqual([
      expect.objectContaining({ label: 'Prefer Rust' }),
    ]);
  });
});
