import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { hydrateStoredChatMessage } from '../src/features/side-panel/chat-state';
import { sameManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';
import type { ConversationEntry } from '../src/features/background/conversation-history';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);
const program = ts.createSourceFile('side_panel.ts', source, ts.ScriptTarget.Latest, true);
let restore: ts.FunctionDeclaration | undefined;
let bootstrap: ts.FunctionDeclaration | undefined;
let refreshOnReturn: ts.FunctionDeclaration | undefined;
function visit(node: ts.Node): void {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'restoreHistoryEntry') restore = node;
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'loadMessages') bootstrap = node;
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'refreshOpenAccountChatOnReturn')
    refreshOnReturn = node;
  ts.forEachChild(node, visit);
}
visit(program);
if (!restore) throw new Error('The production history restore function is missing.');
if (!bootstrap) throw new Error('The production history boot function is missing.');
if (!refreshOnReturn) throw new Error('The production background history refresh is missing.');

const owner = { accountId: 'account-a', authIncarnation: 'session-a' };
const originalId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const originalMessageId = '33333333-3333-4333-8333-333333333333';
const branchMessageId = '44444444-4444-4444-8444-444444444444';

function harness() {
  const entry: ConversationEntry = {
    id: 'local-source',
    owner,
    title: 'Original',
    savedAt: 1_000,
    routing: { selectedModel: 'auto' },
    cloudSync: {
      conversationId: originalId,
      organizationId: null,
      createAcknowledged: true,
      state: 'idle',
    },
    messages: [
      {
        role: 'assistant',
        content: 'Saved answer',
        timestamp: 1_000,
        runtime: 'managed-cloud',
        cloudMessageId: originalMessageId,
      },
    ],
  };
  const branch: ConversationEntry = {
    ...entry,
    id: branchId,
    title: 'Original (branch)',
    cloudSync: { ...entry.cloudSync!, conversationId: branchId },
    messages: [{ ...entry.messages[0]!, cloudMessageId: branchMessageId }],
  };
  const context = {
    managedCloudOwner: { ...owner },
    isStreaming: false,
    conversationGeneration: 1,
    conversationId: 'local-before',
    conversationScope: 'window:2',
    messages: [] as ReturnType<typeof hydrateStoredChatMessage>[],
    selectedModel: 'auto',
  };
  const forkConversationForHistory = vi.fn(async () => branch);
  const persistMessages = vi.fn(async () => undefined);
  const restoreConversationOwnerIfCurrent = vi.fn(async () => true);
  const dependencies = {
    _ctx: context,
    sameManagedCloudOwner,
    getConversation: vi.fn(async (_owner: unknown, _id: string) => entry),
    getConversationScope: async () => 'window:2',
    refreshManagedCloudConversationHistory: vi.fn(
      async (_owner: unknown, item: ConversationEntry, _options?: { signal?: AbortSignal }) => item,
    ),
    hasUnconfirmedStreamCancellation: () => false,
    document: {
      getElementById: (_id: string): { value?: string; hidden?: boolean } | null => null,
    },
    cloudHistoryOwnerAbort: new AbortController(),
    showHistoryStatus: vi.fn(),
    CloudHistoryTrustBoundaryError: class extends Error {},
    CloudHistoryWorkspaceChangedError: class extends Error {},
    CloudHistoryCacheWindowError: class extends Error {},
    CloudHistoryUnavailableError: class extends Error {},
    claimSelectedConversationOwner: async () => ({ conversationId: branchId, forked: true }),
    restoreConversationOwnerIfCurrent,
    forkConversationForHistory,
    updateSendButton: vi.fn(),
    returnFollowUpsToComposer: vi.fn(),
    turnPayloadByMessageId: new Map(),
    editableRewrites: { reset: vi.fn(), hasActiveEdits: () => false },
    clearPendingPageContext: vi.fn(),
    advanceConversationGeneration: () => {
      context.conversationGeneration += 1;
    },
    leaveTemporaryChat: vi.fn(),
    adoptChatProject: vi.fn(),
    normalizeModelId: (value: string) => value,
    resolveModelEffort: () => undefined,
    MAX_STORED_MESSAGES: 50,
    hydrateStoredChatMessage,
    refreshModelPickerUI: vi.fn(),
    refreshEffortUI: vi.fn(),
    updateContextButton: vi.fn(),
    renderMessages: vi.fn(),
    scrollToBottom: vi.fn(),
    persistMessages,
    resumeLatestStoredManagedRun: vi.fn(),
  };
  const compiled = ts.transpileModule(
    `
    let historyRestoreInProgress = false;
    let openChatRefreshAbort = null;
    let historyRestoreToken = 0;
    let activePersistenceEntry;
    ${restore!.getText(program)}
    return { restoreHistoryEntry, isRestoring: () => historyRestoreInProgress };
  `,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
  // llm-guardrail-allow: executes the repository-owned restore handler inside this isolated fixture.
  const api = new Function(...Object.keys(dependencies), compiled)(
    ...Object.values(dependencies),
  ) as {
    restoreHistoryEntry(id: string, reason?: 'navigation' | 'refresh'): Promise<boolean>;
    isRestoring(): boolean;
  };
  return {
    ...api,
    context,
    entry,
    branch,
    forkConversationForHistory,
    persistMessages,
    restoreConversationOwnerIfCurrent,
    dependencies,
  };
}

function returnRefreshHarness(recentsVisible: boolean) {
  const openStoredConversation = vi.fn(async () => true);
  const deps = {
    OPEN_CHAT_REFRESH_ON_RETURN_MS: 10_000,
    managedCloudChatState: 'ready',
    historyRestoreInProgress: false,
    openChatRefreshAbort: null,
    _ctx: { conversationId: 'active', isStreaming: false, temporaryChat: false, messages: [{}] },
    tabCleanupInProgress: false,
    editableRewrites: { hasActiveEdits: () => false },
    activePersistenceEntry: { id: 'active', cloudSync: { conversationId: originalId } },
    document: {
      getElementById: (id: string) =>
        id === 'sp-recents'
          ? { hidden: !recentsVisible }
          : id === 'sp-input'
            ? { value: '' }
            : { classList: { contains: () => false } },
    },
    openStoredConversation,
  };
  const compiled = ts.transpileModule(
    `let lastOpenChatRefreshOnReturn = 0; ${refreshOnReturn!.getText(program)}; return refreshOpenAccountChatOnReturn;`,
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    },
  ).outputText;
  // llm-guardrail-allow: executes the repository-owned focus refresh inside this isolated fixture.
  const refresh = new Function(...Object.keys(deps), compiled)(
    ...Object.values(deps),
  ) as () => void;
  return { refresh, openStoredConversation };
}

describe('background refresh and explicit history selection', () => {
  it('does not start a current-chat refresh while recent chats is open', () => {
    const h = returnRefreshHarness(true);
    h.refresh();
    expect(h.openStoredConversation).not.toHaveBeenCalled();
  });

  it('marks a focus refresh as background work rather than navigation', () => {
    const h = returnRefreshHarness(false);
    h.refresh();
    expect(h.openStoredConversation).toHaveBeenCalledExactlyOnceWith('active', 'refresh');
  });

  it('lets an explicit selection supersede a pending background read without a late overwrite', async () => {
    const h = harness();
    const current = { ...h.entry, id: 'local-before' };
    h.dependencies.getConversation.mockImplementation(async (_owner, id) =>
      id === current.id ? current : h.entry,
    );
    let resolve!: (entry: ConversationEntry) => void;
    const pending = new Promise<ConversationEntry>((done) => {
      resolve = done;
    });
    h.dependencies.refreshManagedCloudConversationHistory.mockImplementation(
      async (_owner, item) => (item.id === current.id ? pending : item),
    );
    const background = h.restoreHistoryEntry(current.id, 'refresh');
    await vi.waitFor(() =>
      expect(h.dependencies.refreshManagedCloudConversationHistory).toHaveBeenCalled(),
    );
    const signal = h.dependencies.refreshManagedCloudConversationHistory.mock.calls[0]?.[2]?.signal;
    const selected = await h.restoreHistoryEntry(h.entry.id);
    resolve(current);
    await background;
    expect(selected).toBe(true);
    expect(signal?.aborted).toBe(true);
    expect(h.context.conversationId).toBe(branchId);
    expect(h.context.messages[0]?.cloudMessageId).toBe(branchMessageId);
    expect(h.isRestoring()).toBe(false);
  });

  it('discards a background result if a draft appeared while it was pending', async () => {
    const h = harness();
    const current = { ...h.entry, id: 'local-before' };
    h.dependencies.getConversation.mockResolvedValue(current);
    const composer = { value: '' };
    h.dependencies.document.getElementById = (id: string) => (id === 'sp-input' ? composer : null);
    let resolve!: (entry: ConversationEntry) => void;
    const pending = new Promise<ConversationEntry>((done) => {
      resolve = done;
    });
    h.dependencies.refreshManagedCloudConversationHistory.mockImplementation(async () => pending);
    const background = h.restoreHistoryEntry(current.id, 'refresh');
    await vi.waitFor(() =>
      expect(h.dependencies.refreshManagedCloudConversationHistory).toHaveBeenCalled(),
    );
    composer.value = 'Keep my draft';
    resolve(current);
    expect(await background).toBe(false);
    expect(h.context.conversationId).toBe(current.id);
    expect(h.context.messages).toEqual([]);
    expect(composer.value).toBe('Keep my draft');
  });

  it('refreshes the owned chat without creating a branch or forcing the viewport to the bottom', async () => {
    const h = harness();
    h.dependencies.getConversation.mockResolvedValue({ ...h.entry, id: 'local-before' });
    expect(await h.restoreHistoryEntry('local-before', 'refresh')).toBe(true);
    expect(h.context.conversationId).toBe('local-before');
    expect(h.forkConversationForHistory).not.toHaveBeenCalled();
    expect(h.dependencies.scrollToBottom).not.toHaveBeenCalled();
  });

  it('preserves a model selection made while the background read was pending', async () => {
    const h = harness();
    const current = { ...h.entry, id: 'local-before' };
    h.dependencies.getConversation.mockResolvedValue(current);
    let resolve!: (entry: ConversationEntry) => void;
    const pending = new Promise<ConversationEntry>((done) => {
      resolve = done;
    });
    h.dependencies.refreshManagedCloudConversationHistory.mockImplementation(async () => pending);
    const background = h.restoreHistoryEntry(current.id, 'refresh');
    await vi.waitFor(() =>
      expect(h.dependencies.refreshManagedCloudConversationHistory).toHaveBeenCalled(),
    );
    h.context.selectedModel = 'selected-after-read';
    resolve(current);
    expect(await background).toBe(false);
    expect(h.context.selectedModel).toBe('selected-after-read');
  });
});

function bootHarness(lazy = false) {
  const h = harness();
  const assignConversationOwner = vi.fn(async () => undefined);
  const refreshManagedCloudConversationHistory = vi.fn(async () => h.branch);
  const deps = {
    ...h.dependencies,
    rebindAuthenticatedConversationHistory: async () => true,
    getFreshClerkAuthContext: async () => ({ owner }),
    refreshManagedCloudRecentHistory: async () => ({ status: 'refreshed', organizationId: null }),
    getActiveConversation: async () =>
      lazy ? undefined : { ...h.entry, id: 'another-chat', cloudSync: undefined },
    cloudMirroringEnabledSnapshot: () => true,
    refreshManagedCloudConversationHistory,
    claimConversationOwner: async () => ({
      conversationId: branchId,
      seedConversationId: h.entry.id,
      forkPointMessageId: originalMessageId,
    }),
    getConversation: async (_owner: unknown, id: string) =>
      id === h.entry.id
        ? h.entry
        : lazy
          ? {
              ...h.branch,
              messages: [],
              cloudSync: { ...h.branch.cloudSync, messagesLoaded: false },
            }
          : undefined,
    replaceConversationOwner: vi.fn(),
    assignConversationOwner,
    updateAttachmentPreview: vi.fn(),
    t: (key: string) => key,
  };
  const compiled = ts.transpileModule(
    `
    let cloudHistoryOrganizationId = null;
    let activePersistenceEntry;
    let composerContextNotice = null;
    ${bootstrap!.getText(program)}
    return { loadMessages, notice: () => composerContextNotice };
  `,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
  // llm-guardrail-allow: executes the repository-owned boot handler inside this isolated fixture.
  const api = new Function(...Object.keys(deps), compiled)(...Object.values(deps)) as {
    loadMessages(): Promise<void>;
    notice(): string | null;
  };
  return { ...h, ...api, assignConversationOwner, refreshManagedCloudConversationHistory };
}

describe('actual pending history-fork boot recovery', () => {
  it('uses the recorded source and fork point rather than a newer global active chat', async () => {
    const h = bootHarness();
    await h.loadMessages();
    expect(h.forkConversationForHistory).toHaveBeenCalledWith(
      owner,
      h.entry,
      branchId,
      expect.any(Object),
      originalMessageId,
    );
    expect(h.context.conversationId).toBe(branchId);
    expect(h.context.messages[0]?.cloudMessageId).toBe(branchMessageId);
    expect(h.assignConversationOwner).toHaveBeenCalledWith('window:2', owner, branchId);
  });

  it('loads an already-created metadata-only branch without another creation request', async () => {
    const h = bootHarness(true);
    await h.loadMessages();
    expect(h.refreshManagedCloudConversationHistory).toHaveBeenCalledOnce();
    expect(h.forkConversationForHistory).not.toHaveBeenCalled();
    expect(h.context.messages[0]?.cloudMessageId).toBe(branchMessageId);
    expect(h.assignConversationOwner).toHaveBeenCalledWith('window:2', owner, branchId);
  });

  it('reports failed boot recovery and preserves the current selection', async () => {
    const h = bootHarness();
    h.forkConversationForHistory.mockRejectedValueOnce(new Error('Branch unavailable'));
    await h.loadMessages();
    expect(h.context.conversationId).toBe('local-before');
    expect(h.context.messages).toEqual([]);
    expect(h.notice()).toBe('Branch unavailable');
    expect(h.assignConversationOwner).not.toHaveBeenCalled();
  });
});

describe('actual selected-history fork admission', () => {
  it('hydrates and persists the canonical branch rather than the original cloud identities', async () => {
    const h = harness();
    const before = structuredClone(h.entry);
    expect(await h.restoreHistoryEntry(h.entry.id)).toBe(true);
    expect(h.forkConversationForHistory).toHaveBeenCalledOnce();
    expect(h.context.conversationId).toBe(branchId);
    expect(h.context.messages[0]?.cloudMessageId).toBe(branchMessageId);
    expect(h.context.messages[0]?.cloudMessageId).not.toBe(originalMessageId);
    expect(h.context.messages[0]?.content).toBe('Saved answer');
    expect(h.persistMessages).toHaveBeenCalledOnce();
    expect(h.entry).toEqual(before);
    expect(h.isRestoring()).toBe(false);
  });

  it('preserves the current view and releases its claim if branch creation fails', async () => {
    const h = harness();
    h.forkConversationForHistory.mockRejectedValueOnce(new Error('Branch unavailable'));
    await expect(h.restoreHistoryEntry(h.entry.id)).rejects.toThrow('Branch unavailable');
    expect(h.context.conversationId).toBe('local-before');
    expect(h.context.messages).toEqual([]);
    expect(h.restoreConversationOwnerIfCurrent).toHaveBeenCalledWith(
      'window:2',
      owner,
      branchId,
      'local-before',
    );
    expect(h.persistMessages).not.toHaveBeenCalled();
    expect(h.isRestoring()).toBe(false);
  });

  it('does not adopt a late branch into a replaced account', async () => {
    const h = harness();
    h.forkConversationForHistory.mockImplementationOnce(async () => {
      h.context.managedCloudOwner = { accountId: 'account-b', authIncarnation: 'session-b' };
      return h.branch;
    });
    expect(await h.restoreHistoryEntry(h.entry.id)).toBe(false);
    expect(h.context.conversationId).toBe('local-before');
    expect(h.context.messages).toEqual([]);
    expect(h.persistMessages).not.toHaveBeenCalled();
  });
});
