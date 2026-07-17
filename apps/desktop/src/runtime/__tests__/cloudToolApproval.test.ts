/**
 * CloudToolApprovalRegistry — hasLiveTurn (Finding 1: dead tool-approval
 * buttons after reload/restart) and the recursive-resume real-tool-output
 * fix (Finding 2: a turn suspending AGAIN on a further approval request used
 * to rebuild the prior round's tool result as a hardcoded '(executed)'
 * placeholder instead of the real accumulator content that already streamed
 * -- discarding file contents / command output / search results the model
 * needs to reason about the next call).
 */
import { describe, it, expect, vi } from 'vitest';

const sendCloudApprovalResume = vi.fn();

vi.mock('../../api/cloudApi', () => ({
  sendCloudApprovalResume: (...args: unknown[]) => sendCloudApprovalResume(...args),
}));

import { CloudToolApprovalRegistry, type ResolveApprovalOutcome } from '../cloudToolApproval';

function suspendedSink(
  calls: { toolCallId: string; name: string; args: Record<string, unknown> }[],
  agentActivity?: {
    schemaVersion: 1;
    sessionId: string;
    turnId: string;
    lastSequence: number;
    status: 'running';
    startedAtMs: number;
    updatedAtMs: number;
    entries: [];
  },
) {
  return {
    isSuspended: () => true,
    getAccumulatedContent: () => '',
    getPendingApprovalCalls: () => calls,
    getAgentActivity: () => agentActivity,
  };
}

function completedSink() {
  return {
    isSuspended: () => false,
    getAccumulatedContent: () => 'done',
    getPendingApprovalCalls: () => [],
    getAgentActivity: () => undefined,
  };
}

describe('CloudToolApprovalRegistry.hasLiveTurn', () => {
  it('is false for a conversation that never suspended', () => {
    const registry = new CloudToolApprovalRegistry();
    expect(registry.hasLiveTurn('conv-1')).toBe(false);
  });

  it('is true right after recordTurnOutcome registers a suspended turn', () => {
    const registry = new CloudToolApprovalRegistry();
    registry.recordTurnOutcome(
      'conv-1',
      'gpt-5',
      [],
      suspendedSink([{ toolCallId: 'call_1', name: 'github__get_pr', args: {} }]),
    );
    expect(registry.hasLiveTurn('conv-1')).toBe(true);
  });

  it('is false once the turn completes normally (recordTurnOutcome clears it)', () => {
    const registry = new CloudToolApprovalRegistry();
    registry.recordTurnOutcome(
      'conv-1',
      'gpt-5',
      [],
      suspendedSink([{ toolCallId: 'call_1', name: 'github__get_pr', args: {} }]),
    );
    expect(registry.hasLiveTurn('conv-1')).toBe(true);

    registry.recordTurnOutcome('conv-1', 'gpt-5', [], completedSink());
    expect(registry.hasLiveTurn('conv-1')).toBe(false);
  });

  it('is false for a DIFFERENT conversation whose registry entry was never touched by this instance (simulates a fresh app restart)', () => {
    // A fresh CloudToolApprovalRegistry (as constructed on every app start,
    // since it lives on the ChatRuntime instance, not anything persisted)
    // has no entries at all, regardless of what a persisted message says.
    const freshRegistry = new CloudToolApprovalRegistry();
    expect(freshRegistry.hasLiveTurn('conv-1')).toBe(false);
  });

  it('resolve() is a no-op (returns null) against a conversation with no live turn', async () => {
    const registry = new CloudToolApprovalRegistry();
    const emitted: unknown[] = [];
    const outcome: ResolveApprovalOutcome | null = await registry.resolve(
      'conv-1',
      'call_1',
      'approved',
      (event) => emitted.push(event),
      'https://example.test',
      () => {},
    );
    expect(outcome).toBeNull();
    expect(emitted).toHaveLength(0);
  });
});

describe('CloudToolApprovalRegistry.resolve — recursive resume carries the REAL tool result', () => {
  it('continues the same canonical activity projection across approval resume', async () => {
    const registry = new CloudToolApprovalRegistry();
    registry.recordTurnOutcome(
      'conv-activity',
      'gpt-5',
      [{ role: 'user', content: 'write the file' }],
      suspendedSink([{ toolCallId: 'call_1', name: 'write_file', args: { path: '/tmp/a' } }], {
        schemaVersion: 1,
        sessionId: 'session-activity',
        turnId: 'turn-activity',
        lastSequence: 0,
        status: 'running',
        startedAtMs: 1_000,
        updatedAtMs: 1_000,
        entries: [],
      }),
    );

    sendCloudApprovalResume.mockImplementationOnce(
      async (
        _model: string,
        _messages: unknown,
        _approvals: unknown,
        _onChunk: (text: string) => void,
        onDone: () => void,
        _onError: (error: Error) => void,
        _signal: AbortSignal | undefined,
        onEvent: (payload: Record<string, unknown>) => void,
      ) => {
        onEvent({
          choices: [
            {
              delta: {
                x_agent_event: {
                  schemaVersion: 3,
                  sessionId: 'session-activity',
                  turnId: 'turn-activity',
                  sequence: 1,
                  emittedAtMs: 2_000,
                  event: { type: 'stop', reason: 'end-turn' },
                },
              },
            },
          ],
        });
        onDone();
      },
    );

    const outcome = await registry.resolve(
      'conv-activity',
      'call_1',
      'approved',
      () => {},
      'https://example.test',
      () => {},
    );

    expect(outcome?.agentActivity).toMatchObject({
      turnId: 'turn-activity',
      lastSequence: 1,
      status: 'completed',
    });
  });

  it('replays the actual x_tool_result content (not a placeholder) when a resume suspends again on a further tool', async () => {
    const registry = new CloudToolApprovalRegistry();
    registry.recordTurnOutcome(
      'conv-1',
      'gpt-5',
      [{ role: 'user', content: 'read then summarize the PR' }],
      suspendedSink([{ toolCallId: 'call_1', name: 'read_file', args: { path: '/README.md' } }]),
    );

    const REAL_RESULT = '# My Project\n\nThis project does X, Y, and Z.';

    // First resume (approving call_1): the tool actually runs and reports
    // its real output via x_tool_result, then the turn suspends AGAIN on a
    // second tool.
    sendCloudApprovalResume.mockImplementationOnce(
      async (
        _model: string,
        _messages: unknown,
        _approvals: unknown,
        onChunk: (t: string) => void,
        onDone: () => void,
        _onError: (e: Error) => void,
        _signal: AbortSignal | undefined,
        onEvent: (payload: Record<string, unknown>) => void,
      ) => {
        onChunk('Reading the file...');
        onEvent({
          choices: [
            {
              delta: {
                x_tool_result: {
                  tool_call_id: 'call_1',
                  name: 'read_file',
                  content: REAL_RESULT,
                  is_error: false,
                },
              },
            },
          ],
        });
        onEvent({
          choices: [
            {
              delta: {
                x_tool_approval_request: {
                  tool_call_id: 'call_2',
                  name: 'write_file',
                  args: { path: '/SUMMARY.md' },
                },
              },
            },
          ],
        });
        onDone();
      },
    );

    const firstOutcome = await registry.resolve(
      'conv-1',
      'call_1',
      'approved',
      () => {},
      'https://example.test',
      () => {},
    );
    expect(firstOutcome?.suspended).toBe(true);
    expect(registry.hasLiveTurn('conv-1')).toBe(true);

    // Second resume (approving call_2): capture what thread this call
    // received -- it must carry call_1's REAL result, not '(executed)'.
    let capturedMessages: Array<Record<string, unknown>> = [];
    sendCloudApprovalResume.mockImplementationOnce(
      async (
        _model: string,
        messages: Array<Record<string, unknown>>,
        _approvals: unknown,
        _onChunk: (t: string) => void,
        onDone: () => void,
      ) => {
        capturedMessages = messages;
        onDone();
      },
    );

    await registry.resolve(
      'conv-1',
      'call_2',
      'approved',
      () => {},
      'https://example.test',
      () => {},
    );

    const call1ToolMessage = capturedMessages.find(
      (m) => m['role'] === 'tool' && m['tool_call_id'] === 'call_1',
    );
    expect(call1ToolMessage?.['content']).toBe(REAL_RESULT);
    expect(call1ToolMessage?.['content']).not.toBe('(executed)');
  });

  it('falls back to the placeholder if a result never arrived for an approved call (defensive, not the normal path)', async () => {
    const registry = new CloudToolApprovalRegistry();
    registry.recordTurnOutcome(
      'conv-1',
      'gpt-5',
      [{ role: 'user', content: 'go' }],
      suspendedSink([{ toolCallId: 'call_1', name: 'read_file', args: {} }]),
    );

    // No x_tool_result event this time -- straight to a second suspension.
    sendCloudApprovalResume.mockImplementationOnce(
      async (
        _model: string,
        _messages: unknown,
        _approvals: unknown,
        _onChunk: (t: string) => void,
        onDone: () => void,
        _onError: (e: Error) => void,
        _signal: AbortSignal | undefined,
        onEvent: (payload: Record<string, unknown>) => void,
      ) => {
        onEvent({
          choices: [
            {
              delta: {
                x_tool_approval_request: { tool_call_id: 'call_2', name: 'write_file', args: {} },
              },
            },
          ],
        });
        onDone();
      },
    );
    await registry.resolve(
      'conv-1',
      'call_1',
      'approved',
      () => {},
      'https://example.test',
      () => {},
    );

    let capturedMessages: Array<Record<string, unknown>> = [];
    sendCloudApprovalResume.mockImplementationOnce(
      async (
        _model: string,
        messages: Array<Record<string, unknown>>,
        _approvals: unknown,
        _onChunk: (t: string) => void,
        onDone: () => void,
      ) => {
        capturedMessages = messages;
        onDone();
      },
    );
    await registry.resolve(
      'conv-1',
      'call_2',
      'approved',
      () => {},
      'https://example.test',
      () => {},
    );

    const call1ToolMessage = capturedMessages.find(
      (m) => m['role'] === 'tool' && m['tool_call_id'] === 'call_1',
    );
    expect(call1ToolMessage?.['content']).toBe('(executed)');
  });
});
