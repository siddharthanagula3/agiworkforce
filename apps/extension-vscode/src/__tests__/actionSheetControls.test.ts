import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  DEVELOPER_AGENT_MODE_LABELS,
  DEVELOPER_REASONING_EFFORTS,
  DEVELOPER_REASONING_EFFORT_LABELS,
} from '@agiworkforce/local-runtime-contract';
import { setupCommands, type CommandDeps } from '../core/commandSetup';

type Handler = (...args: unknown[]) => unknown;
type SheetItem = vscode.QuickPickItem & { action?: string };

function mockConfiguration(values: Record<string, unknown>) {
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

function registerCommands(): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  vi.mocked(vscode.commands.registerCommand).mockImplementation(((id: string, handler: Handler) => {
    handlers.set(id, handler);
    return new vscode.Disposable(() => undefined);
  }) as never);
  const stub = new Proxy({}, { get: () => vi.fn() });
  const sidebarProvider = new Proxy(
    {
      activeModel: () => undefined,
      checkpointsAvailable: async () => false,
    },
    {
      get: (target, key) => (key in target ? target[key as keyof typeof target] : vi.fn()),
    },
  );
  setupCommands(
    {
      subscriptions: [],
      secrets: {
        get: vi.fn().mockResolvedValue(undefined),
        store: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        onDidChange: vi.fn(),
      },
      workspaceState: { get: vi.fn(), update: vi.fn(), keys: () => [] },
      globalState: { get: vi.fn(), update: vi.fn(), keys: () => [] },
    } as unknown as vscode.ExtensionContext,
    {
      sidebarProvider,
      conversationTreeProvider: stub,
      localRuntimes: stub,
      contextPanelProvider: stub,
      memoryTreeProvider: stub,
      diffDecorationProvider: stub,
      diagnosticsProvider: stub,
    } as unknown as CommandDeps,
  );
  return handlers;
}

async function openSheet(
  handlers: Map<string, Handler>,
  choose?: (items: SheetItem[]) => SheetItem | undefined,
): Promise<SheetItem[]> {
  let shown: SheetItem[] = [];
  vi.mocked(vscode.window.showQuickPick).mockImplementationOnce((async (items: SheetItem[]) => {
    shown = items;
    return choose?.(items);
  }) as never);
  await handlers.get('agi-workforce.openActionSheet')?.();
  return shown;
}

describe('action sheet model controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscode.workspace.isTrusted = true;
  });

  it('names effort and mode with the labels every developer surface shares', async () => {
    mockConfiguration({ 'agent.effort': 'high', 'agent.mode': 'plan' });
    const items = await openSheet(registerCommands());

    const effort = items.find((item) => item.action === 'effort');
    expect(effort?.label).toContain(DEVELOPER_REASONING_EFFORT_LABELS.high);
    for (const level of DEVELOPER_REASONING_EFFORTS) {
      expect(effort?.description).toContain(DEVELOPER_REASONING_EFFORT_LABELS[level]);
    }
    expect(items.find((item) => item.action === 'mode')?.label).toContain(
      DEVELOPER_AGENT_MODE_LABELS.plan,
    );
  });
});
