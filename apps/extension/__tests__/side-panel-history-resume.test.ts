import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import catalog from '../_locales/en/messages.json';
import { sameManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';
import {
  hydrateStoredChatMessage,
  type StoredSidePanelChatMessage,
} from '../src/features/side-panel/chat-state';

vi.stubGlobal('chrome', {
  i18n: {
    getMessage: (key: string) =>
      (catalog as Record<string, { message?: string } | undefined>)[key]?.message ?? '',
  },
});

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);
const program = ts.createSourceFile('side_panel.ts', source, ts.ScriptTarget.Latest, true);
const declaration = program.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'resumeLatestStoredManagedRun',
);
if (!declaration) throw new Error('The production history-resume admission function is missing.');
const reference = {
  runId: '11111111-1111-4111-8111-111111111111',
  runPath: '/api/llm/v1/chat/completions/runs/11111111-1111-4111-8111-111111111111',
  lastSequence: 2,
};

function historyRefreshHarness(options: { hidden?: boolean; refreshing?: boolean } = {}) {
  let listener: ts.ArrowFunction | undefined;
  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(program) === 'chrome.storage.onChanged.addListener'
    ) {
      const callback = node.arguments[0];
      if (
        callback &&
        ts.isArrowFunction(callback) &&
        callback.getText(program).includes('ASK_BEFORE_ACTING_KEY')
      )
        listener = callback;
    }
    ts.forEachChild(node, visit);
  }
  visit(program);
  if (!listener) throw new Error('The production drawer storage listener is missing.');
  const refreshDrawerHistory = vi.fn().mockResolvedValue(undefined);
  const showHistoryStatus = vi.fn();
  const dependencies = {
    BROWSER_STORE_KEY: 'history',
    ASK_BEFORE_ACTING_KEY: 'permission',
    recentsSheet: { hidden: options.hidden ?? false },
    recentsRefreshAbort: options.refreshing ? new AbortController() : null,
    refreshDrawerHistory,
    showHistoryStatus,
    t: (key: string) => key,
  };
  const compiled = ts.transpileModule(`return (${listener.getText(program)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
  const onChanged = new Function(...Object.keys(dependencies), compiled)(
    ...Object.values(dependencies),
  ) as (changes: Record<string, unknown>, area: string) => void;
  return { onChanged, refreshDrawerHistory, showHistoryStatus };
}

describe('open recent chats storage refresh', () => {
  it('refreshes the visible list when account history changes without another cloud request', () => {
    const { onChanged, refreshDrawerHistory } = historyRefreshHarness();
    onChanged({ history: { newValue: {} } }, 'local');
    expect(refreshDrawerHistory).toHaveBeenCalledExactlyOnceWith();
  });

  it.each([{ hidden: true }, { refreshing: true }])(
    'preserves a closed drawer or its active account fetch (%j)',
    (options) => {
      const { onChanged, refreshDrawerHistory } = historyRefreshHarness(options);
      onChanged({ history: { newValue: {} } }, 'local');
      expect(refreshDrawerHistory).not.toHaveBeenCalled();
    },
  );

  it('ignores unrelated settings and nonlocal history events', () => {
    const { onChanged, refreshDrawerHistory } = historyRefreshHarness();
    onChanged({ history: { newValue: {} } }, 'session');
    onChanged({ other: { newValue: {} } }, 'local');
    expect(refreshDrawerHistory).not.toHaveBeenCalled();
  });

  it('reports a failed local history read without an unhandled rejection', async () => {
    const { onChanged, refreshDrawerHistory, showHistoryStatus } = historyRefreshHarness();
    refreshDrawerHistory.mockRejectedValueOnce(new Error('Storage unavailable'));
    onChanged({ history: { newValue: {} } }, 'local');
    await Promise.resolve();
    expect(showHistoryStatus).toHaveBeenCalledWith('spHistoryRefreshFailed');
  });
});

function harness(stored: StoredSidePanelChatMessage) {
  const message = hydrateStoredChatMessage(stored, 'restored-summary');
  const context = {
    managedCloudOwner: { accountId: 'account-a', authIncarnation: 'session-a' },
    conversationGeneration: 1,
    messages: [message],
  };
  const resumeManagedCloudRun = vi.fn();
  const adoptClosedPanelTurn = vi.fn(() => Promise.resolve());
  const dependencies = {
    _ctx: context,
    sameManagedCloudOwner,
    resumeManagedCloudRun,
    adoptClosedPanelTurn,
  };
  const compiled = ts.transpileModule(
    `${declaration.getText(program)};return resumeLatestStoredManagedRun;`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
  // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
  const admit = new Function(...Object.keys(dependencies), compiled)(
    ...Object.values(dependencies),
  ) as (generation: number) => void;
  return { context, message, resumeManagedCloudRun, adoptClosedPanelTurn, admit };
}

describe('actual hydration to history-resume admission', () => {
  it.each([undefined, false])(
    'does not resume a completed non-interrupted legacy reference (detachable=%s)',
    async (detachable) => {
      const state = harness({
        role: 'assistant',
        content: '46 plots. Watering at 19:30. GARDEN-COMPLETE-812.',
        timestamp: 1,
        streaming: false,
        cloudAgentRun: { ...reference, detachable },
      });
      state.admit(1);
      await Promise.resolve();
      expect(state.message.streaming).toBeUndefined();
      expect(state.resumeManagedCloudRun).not.toHaveBeenCalled();
      expect(state.message.content.match(/GARDEN-COMPLETE-812/g)).toHaveLength(1);
    },
  );

  it('resumes a genuinely interrupted durable run with its existing text for replay deduplication', async () => {
    const state = harness({
      role: 'assistant',
      content: 'Already visible partial output.',
      timestamp: 1,
      streaming: true,
      cloudAgentRun: { ...reference, detachable: true, state: 'running' },
    });
    state.admit(1);
    await Promise.resolve();
    expect(state.resumeManagedCloudRun).toHaveBeenCalledExactlyOnceWith(
      'restored-summary',
      expect.objectContaining({ runId: reference.runId, state: 'running' }),
      'Already visible partial output.',
      false,
    );
  });

  it('recovers an interrupted durable legacy reference with unknown state without fabricating completion', async () => {
    const state = harness({
      role: 'assistant',
      content: 'Partial.',
      timestamp: 1,
      streaming: true,
      cloudAgentRun: { ...reference, detachable: true },
    });
    state.admit(1);
    await Promise.resolve();
    expect(state.resumeManagedCloudRun).toHaveBeenCalledOnce();
    expect(state.message.cloudAgentRun?.state).toBeUndefined();
  });

  it.each(['pending', 'unconfirmed'] as const)(
    'keeps %s Stop behind retry-Stop instead of automatic replay',
    async (streamCancellation) => {
      const state = harness({
        role: 'assistant',
        content: 'Partial.',
        timestamp: 1,
        streaming: true,
        streamCancellation,
        error: true,
        cloudAgentRun: { ...reference, detachable: true, state: 'running' },
      });
      state.admit(1);
      await Promise.resolve();
      expect(state.resumeManagedCloudRun).not.toHaveBeenCalled();
      expect(state.message.streamCancellation).toBe('unconfirmed');
    },
  );

  it('does not auto-recover request-scoped references even if their stored reader was interrupted', async () => {
    const state = harness({
      role: 'assistant',
      content: 'Partial.',
      timestamp: 1,
      streaming: true,
      cloudAgentRun: { ...reference, detachable: false },
    });
    state.admit(1);
    await Promise.resolve();
    expect(state.resumeManagedCloudRun).not.toHaveBeenCalled();
    expect(state.adoptClosedPanelTurn).toHaveBeenCalledExactlyOnceWith(
      1,
      state.context.managedCloudOwner,
    );
  });

  it('rechecks the captured chat generation before the queued resume executes', async () => {
    const state = harness({
      role: 'assistant',
      content: 'Partial.',
      timestamp: 1,
      streaming: true,
      cloudAgentRun: { ...reference, detachable: true, state: 'running' },
    });
    state.admit(1);
    state.context.conversationGeneration++;
    await Promise.resolve();
    expect(state.resumeManagedCloudRun).not.toHaveBeenCalled();
  });
});

describe('stored attachment replay admission', () => {
  function replay(attachments: Array<Record<string, unknown>>, pages?: unknown[]) {
    const node = program.statements.find(
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'replayableTurnPayload',
    );
    if (!node) throw new Error('Production replay admission missing');
    const compiled = ts.transpileModule(`${node.getText(program)};return replayableTurnPayload;`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
    const run = new Function('turnPayloadByMessageId', 'expandSlashCommand', compiled)(
      new Map(),
      () => null,
    );
    return run({ id: 'saved-user', content: 'Describe this image', attachments, pages });
  }

  it('replays an uploaded image by its original durable asset without needing inline bytes', () => {
    const image = {
      kind: 'image',
      name: 'saved.png',
      mimeType: 'image/png',
      assetId: '11111111-1111-4111-8111-111111111111',
    };
    expect(replay([image])).toMatchObject({
      prompt: 'Describe this image',
      images: [],
      files: [{ name: image.name, mimeType: image.mimeType, assetId: image.assetId }],
    });
  });

  it('requires reattachment when an old image has no durable asset', () => {
    expect(replay([{ kind: 'image', name: 'old.png', mimeType: 'image/png' }])).toBeNull();
  });

  it('does not silently reuse a stale page attachment', () => {
    expect(replay([], [{ url: 'https://example.com' }])).toBeNull();
  });
});

describe('actual continuation request serialization', () => {
  it.each([
    ['resumeManagedCloudRun', 'RESUME_CHAT_RUN'],
    ['resolveManagedToolApproval', 'RESOLVE_CHAT_APPROVAL'],
    ['resolveManagedToolInput', 'RESOLVE_CHAT_INPUT'],
  ])('keeps the local conversation identity in %s', (name, type) => {
    const fn = program.statements.find(
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
    );
    if (!fn) throw new Error('Production continuation function missing');
    let payload: ts.Expression | undefined;
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(program) === 'chrome.runtime.sendMessage'
      )
        payload = node.arguments[0];
      ts.forEachChild(node, visit);
    };
    visit(fn);
    if (!payload || !ts.isObjectLiteralExpression(payload))
      throw new Error('Continuation request payload missing');
    const context = {
      conversationId: 'original-local',
      currentModelKey: undefined,
      previousTaskType: undefined,
    };
    const deps = {
      _ctx: context,
      owner: { accountId: 'fixture-account', authIncarnation: 'fixture-session' },
      SIDE_PANEL_CLIENT_INSTANCE_ID: 'fixture-panel',
      streamId: 'fixture-stream',
      cloudRun: reference,
      alreadyVisibleText: 'Partial reply',
      quickMode: true,
      assistant: { id: 'fixture-stream', content: 'Partial reply' },
      run: reference,
      toolApprovals: [],
      guidance: '',
      toolInputs: [],
    };
    const compiled = ts.transpileModule(`return (${payload.getText(program)});`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    // llm-guardrail-allow: executes the repository's runtime request serialization with isolated bindings.
    const request = new Function(...Object.keys(deps), compiled)(...Object.values(deps));
    context.conversationId = 'later-local';
    expect(request).toMatchObject({
      type,
      historyConversationId: 'original-local',
      id: 'fixture-stream',
      owner: deps.owner,
      alreadyVisibleText: 'Partial reply',
    });
  });
});
