import { describe, expect, it } from 'vitest';
import type { CloudCodeTerminalEntry } from '@agiworkforce/types';
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
    at,
    goal: 'run the tests',
    stopReason: 'done',
    finalMessage: 'Done.',
    errorMessage: null,
    ...overrides,
  };
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
