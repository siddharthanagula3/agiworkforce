export const DEFAULT_SLOW_SPAN_THRESHOLD_MS = 1_000;

const TRACE_ID_TAIL_LENGTH = 8;
const TRACE_ID_TAIL_PATTERN = /^[0-9a-f]{8}$/u;
const TRACE_ID_TAIL_SPACE = 0x1_0000_0000;
const KEEP_NONE = 0;
const KEEP_ALL = 1;

export interface SpanExportDecisionInput {
  readonly traceId: string;
  readonly errored: boolean;
  readonly durationMs: number;
  readonly ratio: number;
  readonly slowThresholdMs: number;
}

export function traceIdInRatio(traceId: string, ratio: number): boolean {
  if (ratio >= KEEP_ALL) return true;
  if (ratio <= KEEP_NONE) return false;
  const tail = traceId.slice(-TRACE_ID_TAIL_LENGTH).toLowerCase();
  if (!TRACE_ID_TAIL_PATTERN.test(tail)) return false;
  return Number.parseInt(tail, 16) < ratio * TRACE_ID_TAIL_SPACE;
}

// Head sampling cannot know whether a span fails or runs long, so this decides at
// onEnd, keyed on the trace id so a trace is kept or dropped whole.
export function keepSpanForExport(input: SpanExportDecisionInput): boolean {
  if (input.errored) return true;
  if (Number.isFinite(input.durationMs) && input.durationMs >= input.slowThresholdMs) return true;
  return traceIdInRatio(input.traceId, input.ratio);
}
