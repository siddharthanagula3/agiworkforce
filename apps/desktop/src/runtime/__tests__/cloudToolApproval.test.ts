import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendCloudApprovalResume = vi.fn();

vi.mock('../../api/cloudApi', () => ({
  sendCloudApprovalResume: (...args: unknown[]) => sendCloudApprovalResume(...args),
}));

import { CloudToolApprovalRegistry } from '../cloudToolApproval';

const RUN_ID = '0190a000-0000-7000-8000-000000000099';
const FIXTURE_MODEL_ID = 'fixture-model';

function suspendedSink(
  calls: { toolCallId: string; name: string; args: Record<string, unknown> }[],
) {
  return {
    isSuspended: () => true,
    getAccumulatedContent: () => 'Before approval.',
    getPendingApprovalCalls: () => calls,
    getAgentActivity: () => undefined,
    getMessageProjection: () => ({}),
  };
}

function completedSink() {
  return {
    isSuspended: () => false,
    getAccumulatedContent: () => 'done',
    getPendingApprovalCalls: () => [],
    getAgentActivity: () => undefined,
    getMessageProjection: () => ({}),
  };
}

describe('CloudToolApprovalRegistry', () => {
  beforeEach(() => sendCloudApprovalResume.mockReset());

  it('registers a suspended server-owned run and clears a completed turn', () => {
    const registry = new CloudToolApprovalRegistry();
    registry.recordTurnOutcome(
      'conv-1',
      RUN_ID,
      FIXTURE_MODEL_ID,
      suspendedSink([{ toolCallId: 'call_1', name: 'read_file', args: {} }]),
    );
    expect(registry.hasLiveTurn('conv-1')).toBe(true);

    registry.recordTurnOutcome('conv-1', RUN_ID, FIXTURE_MODEL_ID, completedSink());
    expect(registry.hasLiveTurn('conv-1')).toBe(false);
  });

  it('hydrates a persisted approval projection after an app restart', () => {
    const registry = new CloudToolApprovalRegistry();

    expect(
      registry.hasLiveTurn('conv-1', {
        assistantMessageId: 'assistant-1',
        runId: RUN_ID,
        model: FIXTURE_MODEL_ID,
        assistantContent: 'Before approval.',
        calls: [
          {
            toolCallId: 'call_1',
            name: 'read_file',
            args: { path: '/README.md' },
            decision: 'approved',
          },
          { toolCallId: 'call_2', name: 'write_file', args: { path: '/SUMMARY.md' } },
        ],
      }),
    ).toBe(true);
  });

  it('submits only the run id and complete decision set', async () => {
    const registry = new CloudToolApprovalRegistry();
    registry.recordTurnOutcome(
      'conv-1',
      RUN_ID,
      FIXTURE_MODEL_ID,
      suspendedSink([
        { toolCallId: 'call_1', name: 'read_file', args: {} },
        { toolCallId: 'call_2', name: 'write_file', args: {} },
      ]),
    );
    sendCloudApprovalResume.mockImplementationOnce(
      async (
        _runId: string,
        _approvals: unknown,
        _onChunk: (text: string) => void,
        onDone: () => void,
      ) => onDone(),
    );

    await registry.resolve(
      'conv-1',
      'call_1',
      'approved',
      () => {},
      'https://example.test',
      () => {},
    );
    expect(sendCloudApprovalResume).not.toHaveBeenCalled();

    await registry.resolve(
      'conv-1',
      'call_2',
      'rejected',
      () => {},
      'https://example.test',
      () => {},
    );

    expect(sendCloudApprovalResume).toHaveBeenCalledWith(
      RUN_ID,
      [
        { tool_call_id: 'call_1', decision: 'approved' },
        { tool_call_id: 'call_2', decision: 'rejected' },
      ],
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      undefined,
      expect.any(Function),
      expect.stringContaining('agi.chat.desktop.tool-resume.'),
      undefined,
    );
  });

  it('exposes a persistable partial decision on the original assistant message', async () => {
    const registry = new CloudToolApprovalRegistry();
    registry.recordTurnOutcome(
      'conv-1',
      RUN_ID,
      FIXTURE_MODEL_ID,
      suspendedSink([
        { toolCallId: 'call_1', name: 'read_file', args: {} },
        { toolCallId: 'call_2', name: 'write_file', args: {} },
      ]),
      'assistant-1',
    );

    await registry.resolve(
      'conv-1',
      'call_1',
      'approved',
      () => {},
      'https://example.test',
      () => {},
    );

    expect(registry.getTurnProjection('conv-1')).toMatchObject({
      assistantMessageId: 'assistant-1',
      runId: RUN_ID,
      calls: [{ toolCallId: 'call_1', decision: 'approved' }, { toolCallId: 'call_2' }],
    });
  });

  it('keeps the same run id when the continuation suspends again', async () => {
    const registry = new CloudToolApprovalRegistry();
    registry.recordTurnOutcome(
      'conv-1',
      RUN_ID,
      FIXTURE_MODEL_ID,
      suspendedSink([{ toolCallId: 'call_1', name: 'read_file', args: {} }]),
    );
    sendCloudApprovalResume.mockImplementationOnce(
      async (
        _runId: string,
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
                x_tool_approval_request: {
                  tool_call_id: 'call_2',
                  name: 'write_file',
                  args: {},
                },
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

    sendCloudApprovalResume.mockImplementationOnce(
      async (
        _runId: string,
        _approvals: unknown,
        _onChunk: (text: string) => void,
        onDone: () => void,
      ) => onDone(),
    );
    await registry.resolve(
      'conv-1',
      'call_2',
      'approved',
      () => {},
      'https://example.test',
      () => {},
    );

    expect(sendCloudApprovalResume.mock.calls[1]?.[0]).toBe(RUN_ID);
  });

  it('keeps a checkpoint retryable when resume fails before completion', async () => {
    const registry = new CloudToolApprovalRegistry();
    registry.recordTurnOutcome(
      'conv-1',
      RUN_ID,
      FIXTURE_MODEL_ID,
      suspendedSink([{ toolCallId: 'call_1', name: 'read_file', args: {} }]),
    );
    sendCloudApprovalResume.mockImplementationOnce(
      async (
        _runId: string,
        _approvals: unknown,
        _onChunk: (text: string) => void,
        _onDone: () => void,
        onError: (error: Error) => void,
      ) => onError(new Error('network failed')),
    );

    await expect(
      registry.resolve(
        'conv-1',
        'call_1',
        'approved',
        () => {},
        'https://example.test',
        () => {},
      ),
    ).rejects.toThrow('network failed');
    expect(registry.hasLiveTurn('conv-1')).toBe(true);
  });

  it('reuses the same idempotency key when the same checkpoint is retried', async () => {
    const registry = new CloudToolApprovalRegistry();
    registry.recordTurnOutcome(
      'conv-1',
      RUN_ID,
      FIXTURE_MODEL_ID,
      suspendedSink([{ toolCallId: 'call_1', name: 'write_file', args: {} }]),
    );
    sendCloudApprovalResume
      .mockImplementationOnce(
        async (
          _runId: string,
          _approvals: unknown,
          _onChunk: (text: string) => void,
          _onDone: () => void,
          onError: (error: Error) => void,
        ) => onError(new Error('response lost')),
      )
      .mockImplementationOnce(
        async (
          _runId: string,
          _approvals: unknown,
          _onChunk: (text: string) => void,
          onDone: () => void,
        ) => onDone(),
      );

    await expect(
      registry.resolve(
        'conv-1',
        'call_1',
        'approved',
        () => {},
        'https://example.test',
        () => {},
      ),
    ).rejects.toThrow('response lost');
    await registry.resolve(
      'conv-1',
      'call_1',
      'approved',
      () => {},
      'https://example.test',
      () => {},
    );

    const firstKey = sendCloudApprovalResume.mock.calls[0]?.[7];
    const retryKey = sendCloudApprovalResume.mock.calls[1]?.[7];
    expect(firstKey).toMatch(/^agi\.chat\.desktop\.tool-resume\.resume-[a-f0-9]{48}$/);
    expect(retryKey).toBe(firstKey);
  });
});
