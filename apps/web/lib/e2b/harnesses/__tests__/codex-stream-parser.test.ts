import { describe, expect, it } from 'vitest';
import { AgentEventSchema } from '@agiworkforce/cloud-contracts';

import { createCodexStreamParser } from '../codex-stream-parser';
import { feedFixture } from './fixture';

const CODEX_FIXTURE = 'codex-exec-json.jsonl';

describe('codex exec --json', () => {
  it('turns the documented jsonl into events the agent event contract accepts', () => {
    const { events } = feedFixture(createCodexStreamParser(), CODEX_FIXTURE);

    for (const event of events) {
      expect(AgentEventSchema.safeParse(event).success).toBe(true);
    }
    expect(events.map((event) => event.type)).toEqual([
      'lifecycle',
      'reasoning-delta',
      'tool-execution-start',
      'tool-execution-end',
      'tool-execution-start',
      'tool-execution-end',
      'text-delta',
    ]);
  });

  it('opens a command item once and closes it with its own id', () => {
    const { events } = feedFixture(createCodexStreamParser(), CODEX_FIXTURE);
    const starts = events.filter((event) => event.type === 'tool-execution-start');

    expect(starts[0]).toMatchObject({
      toolCallId: 'item_1',
      name: 'command_execution',
      category: 'shell',
      summary: 'command_execution: bash -lc ls',
    });
    expect(events.filter((event) => event.type === 'tool-execution-end')[0]).toMatchObject({
      toolCallId: 'item_1',
      name: 'command_execution',
      isError: false,
    });
  });

  it('starts an item that only ever reported completion', () => {
    const { events } = feedFixture(createCodexStreamParser(), CODEX_FIXTURE);
    const fileChangeStart = events.find(
      (event) => event.type === 'tool-execution-start' && event.name === 'file_change',
    );

    expect(fileChangeStart).toMatchObject({ toolCallId: 'item_2', category: 'filesystem' });
  });

  it('reports the thread id, the last agent message and the turn usage', () => {
    const { outcome } = feedFixture(createCodexStreamParser(), CODEX_FIXTURE);

    expect(outcome).toEqual({
      stopReason: 'end-turn',
      finalText: 'Repo contains docs, sdk, and examples directories.',
      sessionId: '0199a213-81c0-7800-8aa1-bbab2a035a53',
      usage: {
        inputTokens: 24763,
        outputTokens: 122,
        cacheReadTokens: 24448,
        reasoningTokens: 64,
      },
    });
  });

  it('marks a non-zero command exit as a failed tool call', () => {
    const parser = createCodexStreamParser();
    const events = parser.push(
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'item_9', type: 'command_execution', command: 'false', exit_code: 1 },
      }),
      'stdout',
    );

    expect(events.at(-1)).toMatchObject({ type: 'tool-execution-end', isError: true });
  });

  it('fails the run on a failed turn and keeps the reported message', () => {
    const parser = createCodexStreamParser();
    parser.push(
      JSON.stringify({ type: 'turn.failed', error: { message: 'model overloaded' } }),
      'stdout',
    );

    expect(parser.finish(0).outcome).toMatchObject({
      stopReason: 'error',
      errorMessage: 'model overloaded',
    });
  });
});
