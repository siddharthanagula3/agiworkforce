import { describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '@agiworkforce/types/protocol';

import { HARNESS_MAX_TURNS } from '../budget';
import { selectHarnessRunner } from '../registry';
import { runHarness } from '../run';
import type { HarnessProcessPort, HarnessProcessRequest, HarnessRunner } from '../types';
import { readFixture } from './fixture';

const WORKSPACE = '/home/user/project';
const PROMPT = 'Fix the failing auth test';
const TIMEOUT_MS = 540_000;
const FAILED_EXIT_CODE = 127;

function claudeRunner(): HarnessRunner {
  const runner = selectHarnessRunner('claude');
  if (!runner) throw new Error('Expected the claude runner');
  return runner;
}

function scriptedPort(
  lines: readonly string[],
  exitCode = 0,
  onRun?: (request: HarnessProcessRequest) => void,
): HarnessProcessPort {
  return {
    async run(request) {
      onRun?.(request);
      for (const line of lines) request.onStdout(line);
      return { exitCode };
    },
  };
}

async function collect(
  port: HarnessProcessPort,
  signal: AbortSignal,
): Promise<{ events: AgentEvent[]; stopReason: string }> {
  const events: AgentEvent[] = [];
  const result = await runHarness({
    runner: claudeRunner(),
    port,
    request: {
      prompt: PROMPT,
      workspacePath: WORKSPACE,
      maxTurns: HARNESS_MAX_TURNS,
      timeoutMs: TIMEOUT_MS,
    },
    signal,
    onEvent: (event) => {
      events.push(event);
    },
  });
  return { events, stopReason: result.outcome.stopReason };
}

const CLAUDE_LINES = readFixture('claude-stream-json.jsonl').split('\n');

describe('running a harness', () => {
  it('streams parsed events and closes with usage then stop', async () => {
    const { events, stopReason } = await collect(
      scriptedPort(CLAUDE_LINES),
      new AbortController().signal,
    );

    expect(events.map((event) => event.type)).toEqual([
      'lifecycle',
      'reasoning-delta',
      'text-delta',
      'tool-execution-start',
      'tool-execution-end',
      'text-delta',
      'usage',
      'stop',
    ]);
    expect(events.at(-2)).toMatchObject({ inputTokens: 12, outputTokens: 712 });
    expect(events.at(-1)).toEqual({ type: 'stop', reason: 'end-turn' });
    expect(stopReason).toBe('end-turn');
  });

  it('hands the port the built command, the workspace and the run budget', async () => {
    const onRun = vi.fn();
    const controller = new AbortController();
    await collect(scriptedPort(CLAUDE_LINES, 0, onRun), controller.signal);

    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun.mock.calls[0]?.[0]).toMatchObject({
      command: claudeRunner().buildCommand({
        prompt: PROMPT,
        workspacePath: WORKSPACE,
        maxTurns: HARNESS_MAX_TURNS,
        timeoutMs: TIMEOUT_MS,
      }),
      cwd: WORKSPACE,
      timeoutMs: TIMEOUT_MS,
      signal: controller.signal,
    });
  });

  it('stops on cancellation without emitting the output it was mid-way through', async () => {
    const controller = new AbortController();
    controller.abort();
    const { events, stopReason } = await collect(scriptedPort(CLAUDE_LINES), controller.signal);

    expect(events).toEqual([{ type: 'stop', reason: 'cancelled' }]);
    expect(stopReason).toBe('cancelled');
  });

  it('reports an error stop when the harness process could not run', async () => {
    const { events, stopReason } = await collect(
      scriptedPort([], FAILED_EXIT_CODE),
      new AbortController().signal,
    );

    expect(events).toEqual([{ type: 'stop', reason: 'error' }]);
    expect(stopReason).toBe('error');
  });

  it('keeps the process error when the parser saw nothing to explain the failure', async () => {
    const port: HarnessProcessPort = {
      async run() {
        return { exitCode: FAILED_EXIT_CODE, error: 'command not found' };
      },
    };
    const result = await runHarness({
      runner: claudeRunner(),
      port,
      request: {
        prompt: PROMPT,
        workspacePath: WORKSPACE,
        maxTurns: HARNESS_MAX_TURNS,
        timeoutMs: TIMEOUT_MS,
      },
      signal: new AbortController().signal,
      onEvent: () => {},
    });

    expect(result.exitCode).toBe(FAILED_EXIT_CODE);
    expect(result.outcome.errorMessage).toBe('command not found');
  });
});
