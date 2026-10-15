import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { sameManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';
import {
  hydrateStoredChatMessage,
  type StoredSidePanelChatMessage,
} from '../src/features/side-panel/chat-state';

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

function harness(stored: StoredSidePanelChatMessage) {
  const message = hydrateStoredChatMessage(stored, 'restored-summary');
  const context = {
    managedCloudOwner: { accountId: 'account-a', authIncarnation: 'session-a' },
    conversationGeneration: 1,
    messages: [message],
  };
  const resumeManagedCloudRun = vi.fn();
  const dependencies = { _ctx: context, sameManagedCloudOwner, resumeManagedCloudRun };
  const compiled = ts.transpileModule(
    `${declaration.getText(program)};return resumeLatestStoredManagedRun;`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
  // llm-guardrail-allow: executes repository-owned browser code inside this isolated test fixture.
  const admit = new Function(...Object.keys(dependencies), compiled)(
    ...Object.values(dependencies),
  ) as (generation: number) => void;
  return { context, message, resumeManagedCloudRun, admit };
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
