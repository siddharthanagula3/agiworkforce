import { describe, expect, it } from 'vitest';
import { AgentEventSchema } from '@agiworkforce/cloud-contracts';

import { createTextParser } from '../text-parser';
import { feedFixture } from './fixture';

const OPENCODE_FIXTURE = 'opencode-run.txt';
const GROK_FIXTURE = 'grok-run.txt';

describe('plain stdout harnesses', () => {
  it('streams one text delta per opencode line and keeps the transcript', () => {
    const { events, outcome } = feedFixture(createTextParser(), OPENCODE_FIXTURE);

    for (const event of events) {
      expect(AgentEventSchema.safeParse(event).success).toBe(true);
    }
    expect(events).toEqual([
      { type: 'text-delta', delta: 'Reading src/server.go\n' },
      { type: 'text-delta', delta: 'Writing src/server.go\n' },
      { type: 'text-delta', delta: 'Created a hello world HTTP server on port 8080.\n' },
    ]);
    expect(outcome).toEqual({
      stopReason: 'end-turn',
      finalText:
        'Reading src/server.go\nWriting src/server.go\nCreated a hello world HTTP server on port 8080.',
    });
  });

  it('reads a grok run the same way', () => {
    const { outcome } = feedFixture(createTextParser(), GROK_FIXTURE);

    expect(outcome.stopReason).toBe('end-turn');
    expect(outcome.finalText).toContain('added the --verbose flag');
  });

  it('reports the stderr tail when the harness exits non-zero', () => {
    const parser = createTextParser();
    parser.push('working', 'stdout');
    parser.push('XAI_API_KEY is not set', 'stderr');

    const flushed = parser.finish(1);
    expect(flushed.events).toEqual([{ type: 'error', message: 'XAI_API_KEY is not set' }]);
    expect(flushed.outcome).toMatchObject({
      stopReason: 'error',
      errorMessage: 'XAI_API_KEY is not set',
    });
  });
});
