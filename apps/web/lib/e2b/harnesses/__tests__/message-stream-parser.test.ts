import { describe, expect, it } from 'vitest';
import { AgentEventSchema } from '@agiworkforce/cloud-contracts';

import { createMessageStreamParser } from '../message-stream-parser';
import { feedFixture } from './fixture';

const CLAUDE_FIXTURE = 'claude-stream-json.jsonl';
const AMP_FIXTURE = 'amp-stream-json.jsonl';

describe('claude code stream-json', () => {
  it('turns the documented jsonl into events the agent event contract accepts', () => {
    const { events } = feedFixture(
      createMessageStreamParser({ emitThinking: true }),
      CLAUDE_FIXTURE,
    );

    for (const event of events) {
      expect(AgentEventSchema.safeParse(event).success).toBe(true);
    }
    expect(events.map((event) => event.type)).toEqual([
      'lifecycle',
      'reasoning-delta',
      'text-delta',
      'tool-execution-start',
      'tool-execution-end',
      'text-delta',
    ]);
  });

  it('names the tool and carries its argument onto the activity events', () => {
    const { events } = feedFixture(
      createMessageStreamParser({ emitThinking: true }),
      CLAUDE_FIXTURE,
    );
    const start = events.find((event) => event.type === 'tool-execution-start');
    const end = events.find((event) => event.type === 'tool-execution-end');

    expect(start).toMatchObject({
      toolCallId: 'toolu_01AbCdEf',
      name: 'Bash',
      category: 'shell',
      summary: 'Bash: pnpm vitest run auth.test.ts',
      input: { command: 'pnpm vitest run auth.test.ts', description: 'Run the failing suite' },
    });
    expect(end).toMatchObject({
      toolCallId: 'toolu_01AbCdEf',
      name: 'Bash',
      isError: true,
      output: 'FAIL auth.test.ts > refreshes an expired token',
    });
  });

  it('reports the session id, the result text, the token usage and the reported cost', () => {
    const { outcome } = feedFixture(
      createMessageStreamParser({ emitThinking: true }),
      CLAUDE_FIXTURE,
    );

    expect(outcome).toEqual({
      stopReason: 'end-turn',
      finalText: 'Fixed the token refresh guard in auth.ts and the suite passes.',
      sessionId: '8f1b0a2c-6a1d-4a54-9f0e-1c2d3e4f5a6b',
      usage: {
        inputTokens: 12,
        outputTokens: 712,
        cacheReadTokens: 18332,
        cacheWriteTokens: 2544,
        costUsd: 0.0417,
      },
    });
  });

  it('drops thinking when the harness was not asked to stream it', () => {
    const { events } = feedFixture(
      createMessageStreamParser({ emitThinking: false }),
      CLAUDE_FIXTURE,
    );

    expect(events.some((event) => event.type === 'reasoning-delta')).toBe(false);
  });

  it('reads the amp thread the same way and keeps its thinking block', () => {
    const { events, outcome } = feedFixture(
      createMessageStreamParser({ emitThinking: true }),
      AMP_FIXTURE,
    );

    expect(events.filter((event) => event.type === 'reasoning-delta')).toHaveLength(1);
    expect(events.find((event) => event.type === 'tool-execution-start')).toMatchObject({
      name: 'edit_file',
      category: 'filesystem',
      summary: 'edit_file: src/config.ts',
    });
    expect(events.find((event) => event.type === 'tool-execution-end')).toMatchObject({
      output: 'Edited src/config.ts',
      isError: false,
    });
    expect(outcome.sessionId).toBe('T-4f2c9a71-3d55-4c0e-9f22-6b8a1d0e7c34');
    expect(outcome.usage).toEqual({
      inputTokens: 4154,
      outputTokens: 206,
      cacheReadTokens: 1984,
    });
  });

  it('fails the run when the harness reports an error result', () => {
    const parser = createMessageStreamParser({ emitThinking: true });
    parser.push(
      JSON.stringify({
        type: 'result',
        subtype: 'error_max_turns',
        is_error: true,
        result: 'Reached the turn limit',
        session_id: 'session-err',
      }),
      'stdout',
    );

    expect(parser.finish(0).outcome).toMatchObject({
      stopReason: 'error',
      errorMessage: 'Reached the turn limit',
    });
  });

  it('fails the run when the process died before any result line', () => {
    const parser = createMessageStreamParser({ emitThinking: true });
    parser.push('claude: command not found', 'stderr');

    expect(parser.finish(127).outcome).toMatchObject({
      stopReason: 'error',
      errorMessage: 'claude: command not found',
    });
  });
});
