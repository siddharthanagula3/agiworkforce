import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVENT_SCHEMA_VERSION,
  getRoutingSlotModel,
  messageKindForAgentEvent,
  TERMINAL_AGENT_TASK_STATES,
} from '@agiworkforce/types';
import {
  normalizeManagedCloudOwner,
  isManagedCloudBroadcastOwnedBy,
} from '../src/features/cloud-bridge/managedCloudAuthority';
import {
  applyCanonicalAgentEvent,
  isEmptyAssistantTurn,
  reconcileManagedRunActivity,
  type SidePanelChatMessage,
} from '../src/features/side-panel/chat-state';
import { applyResolvedRoute, resolvedRouteFrom } from '../src/features/side-panel/answeredModel';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);
const program = ts.createSourceFile('side_panel.ts', source, ts.ScriptTarget.Latest, true);
const registration = program.statements.find(
  (node) =>
    ts.isExpressionStatement(node) &&
    ts.isCallExpression(node.expression) &&
    node.expression.expression.getText(program) === 'chrome.runtime.onMessage.addListener' &&
    node.expression.arguments[0]?.getText(program).includes("chunk.type !== 'CHAT_CHUNK'"),
);
if (
  !registration ||
  !ts.isExpressionStatement(registration) ||
  !ts.isCallExpression(registration.expression)
)
  throw new Error('Actual chat chunk listener missing');
const listener = registration.expression.arguments[0]!.getText(program);
const names = new Set([
  'previousAnswerModel',
  'captureResolvedRoute',
  'stampResolvedRoute',
  'saveStreamCheckpoint',
  'activityRequiresRender',
]);
const functions = program.statements
  .filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text ?? ''))
  .map((node) => node.getText(program));
const interval = program.statements.find(
  (node) =>
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(
      (decl) => decl.name.getText(program) === 'STREAM_TEXT_PERSIST_INTERVAL_MS',
    ),
);
if (!interval || functions.length < 3)
  throw new Error('Actual persistence policy or routing functions missing');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
});
afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

function harness() {
  const owner = { accountId: 'qa-account', authIncarnation: 'qa-session' };
  const streamId = 'stream-fixture';
  const model = getRoutingSlotModel('general_fast');
  const context = {
    managedCloudOwner: owner,
    currentStreamId: streamId as string | null,
    isStreaming: true,
    messages: [
      { id: streamId, role: 'assistant', content: '', timestamp: 10_000, streaming: true },
    ] as SidePanelChatMessage[],
    needsMessageRebuild: false,
    streamTimeoutHandle: null,
  };
  const saved: Array<{
    content: string;
    streaming?: boolean;
    runState?: string;
    lastSequence?: number;
  }> = [];
  const saveMessages = vi.fn(() => {
    const m = context.messages.at(-1)!;
    saved.push({
      content: m.content,
      streaming: m.streaming,
      runState: m.cloudAgentRun?.state,
      lastSequence: m.cloudAgentRun?.lastSequence,
    });
  });
  const renderMessages = vi.fn();
  document.body.innerHTML = `<div id="sp-bubble-${streamId}"></div>`;
  const dependencies = {
    _ctx: context,
    normalizeManagedCloudOwner,
    isManagedCloudBroadcastOwnedBy,
    OPEN_BROWSER_CONVERSATION_MESSAGE: 'OPEN_BROWSER_CONVERSATION',
    SIDE_PANEL_CLIENT_INSTANCE_ID: 'qa-panel',
    ownerByStreamId: new Map([[streamId, owner]]),
    quickModeByStreamId: new Map(),
    cloudRunsByStreamId: new Map(),
    resolvedRouteByStreamId: new Map(),
    streamStartedAtById: new Map([[streamId, 10_000]]),
    assistantCloudIdByStreamId: new Map(),
    quotaWarnedStreamIds: new Set(),
    applyRoutingContinuation: () => false,
    resolvedRouteFrom,
    applyResolvedRoute,
    applyCanonicalAgentEvent,
    reconcileManagedRunActivity,
    messageKindForAgentEvent,
    TERMINAL_AGENT_TASK_STATES,
    isEmptyAssistantTurn,
    armManagedStreamInactivityWatchdog: vi.fn(),
    saveMessages,
    renderMessages,
    removeThinking: vi.fn(),
    trimLiveMessages: vi.fn(),
    updateStreamingBubble: vi.fn(),
    updateSendButton: vi.fn(),
    stopManagedChatKeepalive: vi.fn(),
    taskSiteGrants: { releaseTask: vi.fn(async () => undefined) },
    approveToolsAllowedForChat: vi.fn(),
    sendNextFollowUp: vi.fn(),
    t: (key: string) => key,
  };
  const compiled = ts.transpileModule(
    `${interval.getText(program)};let lastStreamPersistAtMs=0;let lastStreamActivityRenderAtMs=0;${functions.join('\n')};return ${listener};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
  // llm-guardrail-allow: executes the checked-in chunk listener and routing/persistence functions against isolated UI effects.
  const receive = new Function(...Object.keys(dependencies), compiled)(
    ...Object.values(dependencies),
  ) as (chunk: Record<string, unknown>) => void;
  const run = {
    runId: '11111111-1111-4111-8111-111111111111',
    runPath: '/api/llm/v1/chat/completions/runs/11111111-1111-4111-8111-111111111111',
    state: 'running',
    lastSequence: 0,
  };
  const base = {
    type: 'CHAT_CHUNK',
    text: '',
    done: false,
    id: streamId,
    clientInstanceId: 'qa-panel',
    owner,
  };
  const routing = { modelKey: model, reason: 'explicit', taskType: 'simple_chat' };
  const event = (sequence: number, body: Record<string, unknown>) => ({
    schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
    sessionId: 'session-fixture',
    turnId: 'turn-fixture',
    sequence,
    emittedAtMs: Date.now(),
    event: body,
  });
  return {
    context,
    saveMessages,
    renderMessages,
    saved,
    receive: (chunk: Record<string, unknown>) => receive({ ...base, ...chunk }),
    run,
    routing,
    event,
  };
}

describe('stream history work is bounded by checkpoints', () => {
  it('keeps live text but bounds writes and full rebuilds across 1000 text and run-reference updates', () => {
    const h = harness();
    for (let i = 0; i < 1000; i++) {
      vi.setSystemTime(10_000 + i * 10);
      h.receive({ text: 'x', routing: h.routing });
      h.receive({ agentEvent: h.event(i, { type: 'text-delta', delta: 'x' }) });
      h.receive({ cloudRun: { ...h.run, lastSequence: i } });
    }
    expect(h.context.messages[0]!.content).toBe('x'.repeat(1000));
    expect(h.saveMessages.mock.calls.length).toBeLessThanOrEqual(12);
    expect(h.renderMessages.mock.calls.length).toBeLessThanOrEqual(1);
    for (const snapshot of h.saved) {
      if (snapshot.runState === 'running' && snapshot.lastSequence !== undefined)
        expect(snapshot.lastSequence).toBeLessThan(snapshot.content.length);
    }
    const before = h.saveMessages.mock.calls.length;
    h.receive({
      done: true,
      cloudRun: { ...h.run, state: 'ready_for_review', lastSequence: 1000 },
      agentEvent: h.event(1000, {
        type: 'task-state-changed',
        taskId: 'turn-fixture',
        state: 'ready_for_review',
        summary: 'Ready',
      }),
    });
    expect(h.saveMessages.mock.calls.length).toBeGreaterThan(before);
    expect(h.saved.at(-1)).toEqual({
      content: 'x'.repeat(1000),
      streaming: false,
      runState: 'ready_for_review',
      lastSequence: 1000,
    });
  });

  it('persists unchanged routing once and immediately records a meaningful route-label change', () => {
    const h = harness();
    for (let i = 0; i < 100; i++) h.receive({ routing: h.routing });
    expect(h.saveMessages).toHaveBeenCalledTimes(1);
    h.receive({ routing: { ...h.routing, reason: 'preferred_slot' } });
    expect(h.saveMessages).toHaveBeenCalledTimes(2);
    expect(h.context.messages[0]?.autoRouteReason).toBe('preferred_slot');
  });

  it('does not delay a human-input checkpoint inside the text checkpoint interval', () => {
    const h = harness();
    h.receive({
      text: 'x',
      cloudRun: h.run,
      agentEvent: h.event(0, { type: 'text-delta', delta: 'x' }),
    });
    const before = h.saveMessages.mock.calls.length;
    h.receive({
      agentEvent: h.event(1, {
        type: 'task-state-changed',
        taskId: 'turn-fixture',
        state: 'awaiting_input',
        summary: 'Needs your answer',
      }),
    });
    expect(h.saveMessages.mock.calls.length).toBeGreaterThan(before);
    expect(h.context.messages[0]?.agentActivity?.status).toBe('awaiting-approval');
  });

  it('rejects updates from another account before scheduling history or UI work', () => {
    const h = harness();
    h.receive({
      owner: { accountId: 'other-account', authIncarnation: 'other-session' },
      text: 'must not render',
      cloudRun: h.run,
    });
    expect(h.saveMessages).not.toHaveBeenCalled();
    expect(h.renderMessages).not.toHaveBeenCalled();
    expect(h.context.messages[0]?.content).toBe('');
  });
});
