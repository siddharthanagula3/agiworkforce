import { SpanStatusCode, type Context } from '@opentelemetry/api';
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { describe, expect, it } from 'vitest';

import { TailBiasedSpanProcessor } from './otel-sdk';
import {
  DEFAULT_SLOW_SPAN_THRESHOLD_MS,
  keepSpanForExport,
  traceIdInRatio,
} from './trace-sampling';

const OUTSIDE_RATIO_TRACE_ID = 'f'.repeat(32);
const INSIDE_RATIO_TRACE_ID = '0'.repeat(32);
const SLOW_MS = DEFAULT_SLOW_SPAN_THRESHOLD_MS;

function readableSpan(input: {
  traceId: string;
  errored: boolean;
  durationMs: number;
}): ReadableSpan {
  return {
    spanContext: () => ({ traceId: input.traceId, spanId: '0'.repeat(16), traceFlags: 1 }),
    status: { code: input.errored ? SpanStatusCode.ERROR : SpanStatusCode.OK },
    duration: [Math.floor(input.durationMs / 1_000), (input.durationMs % 1_000) * 1e6],
  } as unknown as ReadableSpan;
}

class RecordingProcessor implements SpanProcessor {
  readonly ended: ReadableSpan[] = [];
  started = 0;
  flushed = 0;
  shutdowns = 0;

  onStart(_span: Span, _parentContext: Context): void {
    this.started += 1;
  }

  onEnd(span: ReadableSpan): void {
    this.ended.push(span);
  }

  async forceFlush(): Promise<void> {
    this.flushed += 1;
  }

  async shutdown(): Promise<void> {
    this.shutdowns += 1;
  }
}

describe('traceIdInRatio', () => {
  it('keeps everything at ratio 1 and nothing at ratio 0', () => {
    expect(traceIdInRatio(OUTSIDE_RATIO_TRACE_ID, 1)).toBe(true);
    expect(traceIdInRatio(INSIDE_RATIO_TRACE_ID, 0)).toBe(false);
  });

  it('decides from the trace id, so a whole trace shares one verdict', () => {
    expect(traceIdInRatio(INSIDE_RATIO_TRACE_ID, 0.5)).toBe(true);
    expect(traceIdInRatio(OUTSIDE_RATIO_TRACE_ID, 0.5)).toBe(false);
    expect(traceIdInRatio(OUTSIDE_RATIO_TRACE_ID, 0.5)).toBe(false);
  });

  it('refuses a malformed trace id rather than exporting on a parse accident', () => {
    expect(traceIdInRatio('not-a-trace-id', 0.5)).toBe(false);
  });
});

describe('keepSpanForExport', () => {
  const base = { ratio: 0, slowThresholdMs: SLOW_MS, traceId: OUTSIDE_RATIO_TRACE_ID };

  it('keeps a failure the ratio would have dropped', () => {
    expect(keepSpanForExport({ ...base, errored: true, durationMs: 1 })).toBe(true);
  });

  it('keeps the slow tail the ratio would have dropped', () => {
    expect(keepSpanForExport({ ...base, errored: false, durationMs: SLOW_MS })).toBe(true);
  });

  it('drops a fast healthy span outside the ratio', () => {
    expect(keepSpanForExport({ ...base, errored: false, durationMs: SLOW_MS - 1 })).toBe(false);
  });
});

describe('TailBiasedSpanProcessor', () => {
  it('forwards failures and the slow tail, and drops the fast healthy remainder', () => {
    const inner = new RecordingProcessor();
    const processor = new TailBiasedSpanProcessor(inner, 0, SLOW_MS);

    processor.onEnd(
      readableSpan({ traceId: OUTSIDE_RATIO_TRACE_ID, errored: false, durationMs: 5 }),
    );
    expect(inner.ended).toHaveLength(0);

    processor.onEnd(
      readableSpan({ traceId: OUTSIDE_RATIO_TRACE_ID, errored: true, durationMs: 5 }),
    );
    processor.onEnd(
      readableSpan({ traceId: OUTSIDE_RATIO_TRACE_ID, errored: false, durationMs: SLOW_MS + 1 }),
    );
    expect(inner.ended).toHaveLength(2);
  });

  it('passes start, flush and shutdown straight through', async () => {
    const inner = new RecordingProcessor();
    const processor = new TailBiasedSpanProcessor(inner, 1, SLOW_MS);

    processor.onStart({} as Span, {} as Context);
    await processor.forceFlush();
    await processor.shutdown();

    expect(inner.started).toBe(1);
    expect(inner.flushed).toBe(1);
    expect(inner.shutdowns).toBe(1);
  });
});
