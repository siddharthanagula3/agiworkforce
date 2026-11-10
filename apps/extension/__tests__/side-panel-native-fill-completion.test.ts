import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { sameManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';
import {
  applyBrowserActivityEvent,
  hydrateStoredChatMessage,
  reconcileManagedRunActivity,
  type SidePanelChatMessage,
} from '../src/features/side-panel/chat-state';
import {
  BrowserRunActivityTranslator,
  browserActivityEnvelope,
} from '../src/features/computer-use/browserTurnActivity';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);
const program = ts.createSourceFile('side_panel.ts', source, ts.ScriptTarget.Latest, true);
const names = ['finishVisibleChatTurn', 'completeVerifiedProfileFill', 'recordBrowserActivity'];
const code = program.statements
  .filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''))
  .map((node) => node.getText(program));
if (code.length !== names.length)
  throw new Error('The actual native completion/lifecycle owners are missing.');
const catalog = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../_locales/en/messages.json'),
    'utf8',
  ),
) as Record<string, { message: string }>;

function harness() {
  const owner = { accountId: 'account-a', authIncarnation: 'session-a' };
  const id = 'stream-native-1';
  const message: SidePanelChatMessage = {
    id,
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
    runtime: 'managed-cloud',
    streaming: true,
    model: 'configured-selection',
    provider: 'configured-provider',
  };
  applyBrowserActivityEvent(
    message,
    browserActivityEnvelope(undefined, id, {
      type: 'tool-execution-start',
      toolCallId: 'fill-1',
      name: 'browser_fill_form',
      category: 'computer-use',
      summary: 'Fill form fields',
      input: null,
    }),
  );
  applyBrowserActivityEvent(
    message,
    browserActivityEnvelope(message.browserActivity, id, {
      type: 'tool-execution-end',
      toolCallId: 'fill-1',
      name: 'browser_fill_form',
      output: '7 fields filled and verified.',
      isError: false,
    }),
  );
  const context = {
    currentStreamId: id as string | null,
    managedCloudOwner: owner,
    isStreaming: true,
    messages: [message],
    streamTimeoutHandle: null as ReturnType<typeof setTimeout> | null,
    needsMessageRebuild: false,
  };
  const pendingManagedAdmissions = new Set([id]);
  const ownerByStreamId = new Map([[id, owner]]);
  const assistantId = '11111111-1111-4111-8111-111111111111';
  const snapshots: SidePanelChatMessage[] = [];
  const dependencies = {
    _ctx: context,
    sameManagedCloudOwner,
    pendingManagedAdmissions,
    ownerByStreamId,
    browserTurnMessage: (messageId: string) => context.messages.find((m) => m.id === messageId),
    BrowserRunActivityTranslator,
    browserActivityEnvelope,
    applyBrowserActivityEvent,
    reconcileManagedRunActivity,
    taskSiteGrants: { releaseTask: vi.fn(async () => undefined) },
    quotaWarnedStreamIds: new Set<string>(),
    refreshCloudAccountUI: vi.fn(),
    resolvedRouteByStreamId: new Map(),
    quickModeByStreamId: new Map(),
    streamStartedAtById: new Map([[id, Date.now() - 60]]),
    assistantCloudIdByStreamId: new Map([[id, assistantId]]),
    cloudRunsByStreamId: new Map(),
    stopManagedChatKeepalive: vi.fn(),
    removeThinking: vi.fn(),
    updateSendButton: vi.fn(),
    saveMessages: vi.fn(() => {
      snapshots.push(structuredClone(message));
    }),
    renderMessages: vi.fn(),
    approveToolsAllowedForChat: vi.fn(),
    sendNextFollowUp: vi.fn(),
    isEmptyAssistantTurn: (m: SidePanelChatMessage) => !m.content.trim(),
    t: (key: string, args: string[] = []) =>
      (catalog[key]?.message ?? key).replace('$COUNT$', args[0] ?? ''),
  };
  const compiled = ts.transpileModule(
    `${code.join('\n')}; return { completeVerifiedProfileFill, finishVisibleChatTurn };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
  // llm-guardrail-allow: executes repository-owned completion and activity owners in this isolated fixture.
  const api = new Function(...Object.keys(dependencies), compiled)(
    ...Object.values(dependencies),
  ) as {
    completeVerifiedProfileFill(id: string, count: number): void;
    finishVisibleChatTurn(id: string): void;
  };
  return { ...api, id, message, context, dependencies, snapshots, assistantId };
}

describe('verified native form completion', () => {
  it('finishes from the real receipt without attributing a model and preserves completed activity after hydration', () => {
    const h = harness();
    h.completeVerifiedProfileFill(h.id, 7);
    expect(h.message.content).toBe('Filled 7 fields from your saved profile without submitting.');
    expect(h.message.model).toBeUndefined();
    expect(h.message.provider).toBeUndefined();
    expect(h.message.streaming).toBe(false);
    expect(h.message.cloudMessageId).toBe(h.assistantId);
    expect(h.message.browserActivity?.status).toBe('completed');
    expect(h.context.currentStreamId).toBeNull();
    expect(h.context.isStreaming).toBe(false);
    expect(h.dependencies.pendingManagedAdmissions.has(h.id)).toBe(false);
    expect(h.dependencies.ownerByStreamId.has(h.id)).toBe(false);
    expect(h.dependencies.stopManagedChatKeepalive).toHaveBeenCalledOnce();
    expect(h.dependencies.sendNextFollowUp).toHaveBeenCalledOnce();
    expect(
      h.snapshots.every(
        (snapshot) => snapshot.cloudMessageId === h.assistantId && snapshot.model === undefined,
      ),
    ).toBe(true);
    const saved = h.snapshots[h.snapshots.length - 1]!;
    expect(hydrateStoredChatMessage(saved, 'restored-native').browserActivity?.status).toBe(
      'completed',
    );
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'does not claim an invalid verified count %s',
    (count) => {
      const h = harness();
      const before = structuredClone(h.message);
      h.completeVerifiedProfileFill(h.id, count);
      expect(h.message).toEqual(before);
      expect(h.snapshots).toEqual([]);
      expect(h.context.isStreaming).toBe(true);
    },
  );

  it('does not replace a turn once its model request was dispatched', () => {
    const h = harness();
    h.dependencies.pendingManagedAdmissions.delete(h.id);
    h.completeVerifiedProfileFill(h.id, 7);
    expect(h.snapshots).toEqual([]);
    expect(h.message.content).toBe('');
  });

  it('does not finish an old account turn or a cancelled stream', () => {
    const h = harness();
    h.context.managedCloudOwner = { accountId: 'account-b', authIncarnation: 'session-b' };
    h.completeVerifiedProfileFill(h.id, 7);
    expect(h.snapshots).toEqual([]);
    const stopped = harness();
    stopped.context.currentStreamId = null;
    stopped.completeVerifiedProfileFill(stopped.id, 7);
    expect(stopped.snapshots).toEqual([]);
  });
});
