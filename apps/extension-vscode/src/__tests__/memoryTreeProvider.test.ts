import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { MemoryFactItem, MemoryTreeProvider } from '../memory/memoryTreeProvider';
import { MEMORY_STORE_KEY, addFact, type MemoryFact } from '../memory/memoryStore';

function makeWorkspaceState(initial?: MemoryFact[]) {
  const store = new Map<string, unknown>();
  if (initial !== undefined) store.set(MEMORY_STORE_KEY, initial);
  return {
    get: <T>(key: string): T | undefined => store.get(key) as T | undefined,
    update: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    keys: () => [...store.keys()] as readonly string[],
  };
}

function mockMemoryEnabled(enabled: boolean): void {
  vi.mocked(vscode.workspace.getConfiguration).mockImplementation(
    () =>
      ({
        get: vi.fn((key: string, fallback?: unknown) =>
          key === 'memory.enabled' ? enabled : fallback,
        ),
        update: vi.fn(),
        has: vi.fn().mockReturnValue(true),
        inspect: vi.fn().mockReturnValue(undefined),
      }) as unknown as vscode.WorkspaceConfiguration,
  );
}

const fact = (overrides: Partial<MemoryFact> = {}): MemoryFact => ({
  id: 'id-1',
  text: 'I prefer TypeScript over JavaScript',
  createdAt: '2026-01-15T12:00:00.000Z',
  ...overrides,
});

describe('MemoryFactItem', () => {
  it('shows short text in full and truncates past 60 characters', () => {
    expect(new MemoryFactItem(fact()).label).toBe('I prefer TypeScript over JavaScript');
    expect(new MemoryFactItem(fact({ text: 'B'.repeat(60) })).label).toBe('B'.repeat(60));

    const truncated = new MemoryFactItem(fact({ text: 'A'.repeat(61) })).label as string;
    expect(truncated).toBe(`${'A'.repeat(60)}…`);
  });

  it('keeps the full text and timestamps in an untrusted tooltip', () => {
    const item = new MemoryFactItem(fact({ text: 'C'.repeat(200) }));
    const tooltip = item.tooltip as vscode.MarkdownString;

    expect(tooltip.value).toContain('C'.repeat(200));
    expect(tooltip.value).toContain('Created:');
    expect(tooltip.value).not.toContain('Updated:');
    expect(tooltip.isTrusted).toBe(false);
  });

  it('shows the updated timestamp only when it differs from creation', () => {
    const updated = new MemoryFactItem(
      fact({ updatedAt: '2026-01-16T12:00:00.000Z' }),
    ).tooltip as vscode.MarkdownString;
    expect(updated.value).toContain('Updated:');

    const untouched = new MemoryFactItem(fact({ updatedAt: fact().createdAt }))
      .tooltip as vscode.MarkdownString;
    expect(untouched.value).not.toContain('Updated:');
  });

  it('binds the inline edit and delete menu through contextValue', () => {
    expect(new MemoryFactItem(fact()).contextValue).toBe('memoryFact');
  });
});

describe('MemoryTreeProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMemoryEnabled(true);
  });

  it('lists stored facts at the root and nothing beneath them', () => {
    const provider = new MemoryTreeProvider(makeWorkspaceState([fact()]));
    const children = provider.getChildren();

    expect(children.map((child) => child.label)).toEqual(['I prefer TypeScript over JavaScript']);
    expect(provider.getChildren(children[0])).toEqual([]);
    provider.dispose();
  });

  it('heads the view with an off notice that still lists what is stored', () => {
    mockMemoryEnabled(false);
    const provider = new MemoryTreeProvider(makeWorkspaceState([fact()]));
    const children = provider.getChildren();

    expect(children.map((child) => child.label)).toEqual([
      'Memory is off',
      'I prefer TypeScript over JavaScript',
    ]);
    expect(children[0]?.command?.command).toBe('agi-workforce.memory.toggle');
    expect(children[0]?.contextValue).toBe('memoryDisabled');
    provider.dispose();
  });

  it('refreshes on explicit refresh, on store writes, and on the memory setting changing', async () => {
    const workspaceState = makeWorkspaceState();
    const configListeners: Array<(event: vscode.ConfigurationChangeEvent) => void> = [];
    vi.mocked(vscode.workspace.onDidChangeConfiguration).mockImplementation(((
      listener: (event: vscode.ConfigurationChangeEvent) => void,
    ) => {
      configListeners.push(listener);
      return new vscode.Disposable(() => undefined);
    }) as never);

    const provider = new MemoryTreeProvider(workspaceState);
    const changed = vi.fn();
    const subscription = provider.onDidChangeTreeData(changed);

    provider.refresh();
    expect(changed).toHaveBeenCalledTimes(1);

    await addFact(workspaceState, 'Prefer Rust');
    expect(changed).toHaveBeenCalledTimes(2);

    for (const listener of configListeners) {
      listener({ affectsConfiguration: () => true } as vscode.ConfigurationChangeEvent);
      listener({ affectsConfiguration: () => false } as vscode.ConfigurationChangeEvent);
    }
    expect(changed).toHaveBeenCalledTimes(3);

    subscription.dispose();
    provider.dispose();
  });
});
