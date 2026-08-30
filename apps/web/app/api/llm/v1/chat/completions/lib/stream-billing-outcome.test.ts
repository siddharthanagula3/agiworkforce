import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { resolveBilledOutcome } from './stream-transform';

const STREAM_TRANSFORM = readFileSync(join(__dirname, 'stream-transform.ts'), 'utf8');

function settleCall(marker: string): string {
  const start = STREAM_TRANSFORM.indexOf(marker);
  expect(start, `marker not found: ${marker}`).toBeGreaterThan(-1);
  const settle = STREAM_TRANSFORM.indexOf('settleStreamBilling({', start);
  expect(settle, `no settleStreamBilling after: ${marker}`).toBeGreaterThan(-1);
  return STREAM_TRANSFORM.slice(settle, STREAM_TRANSFORM.indexOf('});', settle));
}

describe('resolveBilledOutcome', () => {
  it('bills a cancelled stream that produced tokens', () => {
    expect(resolveBilledOutcome({ outcome: 'failed', cancelled: true, totalTokens: 1_200 })).toBe(
      'completed',
    );
  });

  it('still refunds a cancelled stream that produced nothing', () => {
    expect(resolveBilledOutcome({ outcome: 'failed', cancelled: true, totalTokens: 0 })).toBe(
      'failed',
    );
  });

  it('refunds a genuine provider failure even when tokens were counted', () => {
    expect(resolveBilledOutcome({ outcome: 'failed', totalTokens: 1_200 })).toBe('failed');
  });

  it('leaves a normal completion alone', () => {
    expect(resolveBilledOutcome({ outcome: 'completed', totalTokens: 1_200 })).toBe('completed');
    expect(resolveBilledOutcome({ totalTokens: 1_200 })).toBe('completed');
  });
});

/**
 * The abort paths run inside a ReadableStream behind an SSE heartbeat and a
 * Response body, which a unit test cannot reliably drive (see the note above
 * resolveBilledOutcome). What a test CAN hold is that every settle site which
 * keeps the partial answer also reports the cancellation, so the decision
 * function above is actually reached with cancelled: true.
 */
describe('settleStreamBilling call sites report client cancellation', () => {
  it('reports cancellation when the stream throws after the client aborted', () => {
    const call = settleCall('llm_stream_threw_mid_stream');
    expect(call).toContain("outcome: 'failed'");
    expect(call, 'a client abort surfacing as a throw must not be refunded').toContain(
      'request.signal.aborted ? { cancelled: true } : {}',
    );
  });

  it('keeps reporting cancellation from the stream cancel handler', () => {
    const call = settleCall('async cancel()');
    expect(call).toContain('cancelled: true');
  });

  it('never persists a partial answer without settling the tokens it kept', () => {
    for (const marker of ['llm_stream_threw_mid_stream', 'async cancel()']) {
      const start = STREAM_TRANSFORM.indexOf(marker);
      const region = STREAM_TRANSFORM.slice(start, start + 2_000);
      expect(region, `${marker} keeps the partial turn`).toContain(
        'persistAssistantTurnSnapshot(true)',
      );
      expect(region, `${marker} must settle billing`).toContain('settleStreamBilling({');
    }
  });
});
