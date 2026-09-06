import { describe, expect, it } from 'vitest';
import type { CloudCodeAgentStep, CloudCodeTerminalEntry } from '@agiworkforce/types';
import { buildCodeTranscript, type CodeTurnRecord } from './code-transcript';

function entry(id: string, command: string, startedAt: string): CloudCodeTerminalEntry {
  return {
    id,
    sessionId: 'session-1',
    command,
    stdout: '',
    stderr: '',
    exitCode: 0,
    startedAt,
    completedAt: startedAt,
  };
}

function turn(id: string, at: string, overrides: Partial<CodeTurnRecord> = {}): CodeTurnRecord {
  return {
    id,
    turnId: id,
    at,
    goal: 'run the tests',
    stopReason: 'done',
    finalMessage: 'Done.',
    errorMessage: null,
    steps: [],
    retryable: false,
    ...overrides,
  };
}

function step(index: number, command: string, output: string): CloudCodeAgentStep {
  return { index, toolName: 'run_command', label: command, output, isError: false };
}

describe('buildCodeTranscript', () => {
  it('collapses consecutive commands into one group', () => {
    const items = buildCodeTranscript(
      [
        entry('a', 'pnpm install', '2026-09-05T10:00:00.000Z'),
        entry('b', 'pnpm test', '2026-09-05T10:00:01.000Z'),
        entry('c', 'pnpm lint', '2026-09-05T10:00:02.000Z'),
      ],
      [],
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'commands' });
    expect(items[0]!.kind === 'commands' && items[0]!.entries.map((e) => e.command)).toEqual([
      'pnpm install',
      'pnpm test',
      'pnpm lint',
    ]);
  });

  it('keeps a turn between the commands that surround it in time', () => {
    const items = buildCodeTranscript(
      [
        entry('a', 'pnpm install', '2026-09-05T10:00:00.000Z'),
        entry('b', 'pnpm test', '2026-09-05T10:00:20.000Z'),
      ],
      [turn('t1', '2026-09-05T10:00:10.000Z')],
    );

    expect(items.map((item) => item.kind)).toEqual(['commands', 'task', 'reply', 'commands']);
  });

  it('shows a running turn as a task with no reply yet', () => {
    const items = buildCodeTranscript(
      [],
      [turn('t1', '2026-09-05T10:00:00.000Z', { stopReason: null, finalMessage: '' })],
    );

    expect(items.map((item) => item.kind)).toEqual(['task']);
  });

  it('appends the error message to the reply body', () => {
    const items = buildCodeTranscript(
      [],
      [
        turn('t1', '2026-09-05T10:00:00.000Z', {
          stopReason: 'error',
          finalMessage: 'Partial work.',
          errorMessage: 'The sandbox went away.',
        }),
      ],
    );

    const reply = items.find((item) => item.kind === 'reply');
    expect(reply?.kind === 'reply' && reply.text).toBe('Partial work.\n\nThe sandbox went away.');
    expect(reply?.kind === 'reply' && reply.stopReason).toBe('error');
  });

  it('places the steps a turn ran between its task and its reply', () => {
    const items = buildCodeTranscript(
      [],
      [
        turn('t1', '2026-09-05T10:00:00.000Z', {
          steps: [step(1, 'node -v', 'v22.11.0'), step(2, 'ls -a', 'README.md')],
        }),
      ],
    );

    expect(items.map((item) => item.kind)).toEqual(['task', 'steps', 'reply']);
    const steps = items.find((item) => item.kind === 'steps');
    expect(steps?.kind === 'steps' && steps.steps.map((entry) => entry.label)).toEqual([
      'node -v',
      'ls -a',
    ]);
  });

  it('offers a retry only on a turn marked retryable', () => {
    const items = buildCodeTranscript(
      [],
      [
        turn('t1', '2026-09-05T10:00:00.000Z', {
          stopReason: 'error',
          errorMessage: 'The sandbox went away.',
          retryable: true,
        }),
      ],
    );

    const reply = items.find((item) => item.kind === 'reply');
    expect(reply?.kind === 'reply' && reply.retryGoal).toBe('run the tests');
  });

  it('does not mutate the entry arrays it was handed', () => {
    const first = [entry('a', 'ls', '2026-09-05T10:00:00.000Z')];
    const items = buildCodeTranscript(
      [...first, entry('b', 'pwd', '2026-09-05T10:00:01.000Z')],
      [],
    );

    expect(items[0]!.kind === 'commands' && items[0]!.entries).toHaveLength(2);
    expect(first).toHaveLength(1);
  });
});
