import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVENT_SCHEMA_VERSION,
  managedCloudAgentRunPath,
} from '@agiworkforce/cloud-contracts';
import {
  executeChromeManagedCallerResume,
  executeChromeManagedApproval,
  executeChromeManagedToolInput,
  type ChromeManagedCallerResumeDependencies,
} from '../src/features/cloud-bridge/managedChatHandler';
import type { FreeTrialChunk } from '../src/features/cloud-bridge/freeTrialClient';
const runId = '11111111-1111-4111-8111-111111111111';
const request = () => ({
  id: 'fixture-resume',
  run: { runId, runPath: managedCloudAgentRunPath(runId), lastSequence: 7 },
  receipt: {
    schema_version: AGENT_EVENT_SCHEMA_VERSION,
    run_id: runId,
    turn_id: 'fixture-turn',
    next_event_sequence: 8,
    tool_results: [{ tool_call_id: 'fixture-call', content: 'Verified stored result' }],
  },
  originalToolNames: ['browser_read_page'],
});
function stream(...chunks: FreeTrialChunk[]): AsyncGenerator<FreeTrialChunk> {
  return (async function* () {
    for (const chunk of chunks) yield chunk;
  })();
}
function dependencies(
  overrides: Partial<ChromeManagedCallerResumeDependencies> = {},
): ChromeManagedCallerResumeDependencies {
  return {
    getAuthToken: vi.fn(async () => 'fixture-token'),
    streamCaller: vi.fn(() => stream({ type: 'text', text: 'Recovered reply' }, { type: 'done' })),
    onText: vi.fn(),
    ...overrides,
  };
}
describe('saved caller result resume', () => {
  it('posts the preserved result and original names, then relays the reply', async () => {
    const input = request();
    const deps = dependencies({
      getAuthToken: vi.fn(async () => {
        input.receipt.tool_results[0]!.content = 'Later mutation';
        input.originalToolNames[0] = 'later_capability';
        return 'fixture-token';
      }),
    });
    expect((await executeChromeManagedCallerResume(input, deps)).status).toBe('success');
    expect(deps.streamCaller).toHaveBeenCalledExactlyOnceWith(
      request().receipt,
      ['browser_read_page'],
      'fixture-token',
      {},
    );
    expect(deps.onText).toHaveBeenCalledExactlyOnceWith('Recovered reply');
  });
  it('rejects a foreign saved receipt before auth or transport', async () => {
    const input = request();
    input.receipt.run_id = '22222222-2222-4222-8222-222222222222';
    const deps = dependencies();
    expect(await executeChromeManagedCallerResume(input, deps)).toMatchObject({
      status: 'error',
      code: 'invalid_request',
    });
    expect(deps.getAuthToken).not.toHaveBeenCalled();
    expect(deps.streamCaller).not.toHaveBeenCalled();
  });
  it('preserves rich file output while refusing new browser execution', async () => {
    const files: Extract<FreeTrialChunk, { type: 'generated-files' }> = {
      type: 'generated-files',
      files: [
        {
          id: 'fixture-file',
          file_name: 'report.txt',
          mime_type: 'text/plain',
          uri: '/api/files/fixture-file',
          byte_count: 20,
          kind: 'file',
          surface: 'file',
          previewable: true,
        },
      ],
    };
    const onGeneratedFiles = vi.fn();
    const deps = dependencies({
      streamCaller: vi.fn(() =>
        stream(
          files,
          {
            type: 'tool-handoff',
            calls: [
              {
                id: 'next-call',
                type: 'function',
                function: { name: 'browser_read_page', arguments: '{}' },
              },
            ],
          },
          { type: 'done' },
        ),
      ),
      onGeneratedFiles,
    });
    expect(await executeChromeManagedCallerResume(request(), deps)).toMatchObject({
      status: 'error',
      code: 'protocol_error',
    });
    expect(onGeneratedFiles).toHaveBeenCalledExactlyOnceWith(files);
  });
  it('reports refresh failure without posting or discarding a saved receipt', async () => {
    const deps = dependencies({
      getAuthToken: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    expect(await executeChromeManagedCallerResume(request(), deps)).toMatchObject({
      status: 'error',
      code: 'server_error',
    });
    expect(deps.streamCaller).not.toHaveBeenCalled();
  });
});

describe('hosted continuation offering snapshots', () => {
  it('retains original approval decisions and decoder names across credential refresh', async () => {
    const names = ['browser_read_page'];
    const decisions = [{ tool_call_id: 'hosted-call', decision: 'approved' as const }];
    const streamApproval = vi.fn(() => stream({ type: 'done' }));
    const result = await executeChromeManagedApproval(
      {
        id: 'approval-snapshot',
        run: request().run,
        toolApprovals: decisions,
        originalCallerToolNames: names,
      },
      {
        getAuthToken: vi.fn(async () => {
          names[0] = 'later_tool';
          decisions[0]!.tool_call_id = 'later-call';
          return 'fresh-token';
        }),
        streamApproval,
        onText: vi.fn(),
      },
    );
    expect(result.status).toBe('success');
    expect(streamApproval).toHaveBeenCalledWith(
      runId,
      [{ tool_call_id: 'hosted-call', decision: 'approved' }],
      'fresh-token',
      expect.objectContaining({ originalCallerToolNames: ['browser_read_page'] }),
    );
  });
  it('retains original input answers and decoder names across credential refresh', async () => {
    const names = ['browser_read_page'];
    const inputs = [{ tool_call_id: 'hosted-call', input_responses: { answer: 'original' } }];
    const streamToolInput = vi.fn(() => stream({ type: 'done' }));
    const result = await executeChromeManagedToolInput(
      {
        id: 'input-snapshot',
        run: request().run,
        toolInputs: inputs,
        originalCallerToolNames: names,
      },
      {
        getAuthToken: vi.fn(async () => {
          names[0] = 'later_tool';
          inputs[0]!.input_responses.answer = 'later';
          return 'fresh-token';
        }),
        streamToolInput,
        onText: vi.fn(),
      },
    );
    expect(result.status).toBe('success');
    expect(streamToolInput).toHaveBeenCalledWith(
      runId,
      [{ tool_call_id: 'hosted-call', input_responses: { answer: 'original' } }],
      'fresh-token',
      expect.objectContaining({ originalCallerToolNames: ['browser_read_page'] }),
    );
  });
  it('defers a complete owned caller pause to a broker without executing it', async () => {
    const { tool_results: _results, ...cursor } = request().receipt;
    const calls = [
      {
        id: 'next-call',
        type: 'function' as const,
        function: { name: 'browser_read_page', arguments: '{}' },
      },
    ];
    const onCallerCheckpoint = vi.fn();
    const deps = dependencies({
      onCallerCheckpoint,
      streamCaller: vi.fn(() =>
        stream(
          { type: 'tool-handoff', calls, continuation: { ...cursor, calls } },
          { type: 'done' },
        ),
      ),
    });
    expect((await executeChromeManagedCallerResume(request(), deps)).status).toBe('success');
    expect(onCallerCheckpoint).toHaveBeenCalledExactlyOnceWith({ ...cursor, calls });
  });
  it('refuses a foreign run even when a broker callback is installed', async () => {
    const onCallerCheckpoint = vi.fn();
    const deps = dependencies({
      onCallerCheckpoint,
      streamCaller: vi.fn(() =>
        stream(
          {
            type: 'run',
            run: {
              runId: '22222222-2222-4222-8222-222222222222',
              runPath: '/api/llm/v1/chat/completions/runs/22222222-2222-4222-8222-222222222222',
              lastSequence: 8,
            },
          },
          { type: 'done' },
        ),
      ),
    });
    expect(await executeChromeManagedCallerResume(request(), deps)).toMatchObject({
      status: 'error',
      code: 'protocol_error',
    });
    expect(onCallerCheckpoint).not.toHaveBeenCalled();
  });
});
