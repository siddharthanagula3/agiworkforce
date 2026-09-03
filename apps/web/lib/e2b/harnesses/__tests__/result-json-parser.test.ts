import { describe, expect, it } from 'vitest';
import { AgentEventSchema } from '@agiworkforce/cloud-contracts';

import { createResultJsonParser } from '../result-json-parser';
import { feedFixture } from './fixture';

const DROID_FIXTURE = 'droid-exec-json.json';

describe('droid exec --output-format json', () => {
  it('turns the single result object into the agent event contract', () => {
    const { events, outcome } = feedFixture(createResultJsonParser(), DROID_FIXTURE);

    for (const event of events) {
      expect(AgentEventSchema.safeParse(event).success).toBe(true);
    }
    expect(events).toEqual([
      { type: 'text-delta', delta: 'Added error handling to the three API endpoints.' },
    ]);
    expect(outcome).toEqual({
      stopReason: 'end-turn',
      finalText: 'Added error handling to the three API endpoints.',
      sessionId: '01JCV9ZK3M4P5Q6R7S8T9U0V1W',
    });
  });

  it('fails the run when the harness reports an error result', () => {
    const parser = createResultJsonParser();
    parser.push(
      JSON.stringify({
        type: 'result',
        subtype: 'error',
        is_error: true,
        result: 'FACTORY_API_KEY is not set',
        session_id: 'droid-1',
      }),
      'stdout',
    );

    expect(parser.finish(1).outcome).toMatchObject({
      stopReason: 'error',
      errorMessage: 'FACTORY_API_KEY is not set',
    });
  });

  it('keeps unparseable output as text instead of losing the run', () => {
    const parser = createResultJsonParser();
    parser.push('droid: unknown flag --output-format', 'stdout');

    const flushed = parser.finish(0);
    expect(flushed.events).toEqual([
      { type: 'text-delta', delta: 'droid: unknown flag --output-format' },
    ]);
    expect(flushed.outcome.stopReason).toBe('end-turn');
  });

  it('carries reported usage and cost when the harness includes them', () => {
    const parser = createResultJsonParser();
    parser.push(
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        result: 'done',
        total_cost_usd: 0.12,
        usage: { input_tokens: 400, output_tokens: 90 },
      }),
      'stdout',
    );

    expect(parser.finish(0).outcome.usage).toEqual({
      inputTokens: 400,
      outputTokens: 90,
      costUsd: 0.12,
    });
  });
});
