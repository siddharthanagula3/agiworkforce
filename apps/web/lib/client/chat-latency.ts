export const CHAT_LATENCY_POINT = {
  submit: 't0-submit',
  fetch: 't1-fetch',
  firstChunk: 't7-first-chunk',
  firstPaint: 't8-first-paint',
  firstSentence: 't9-first-sentence',
  done: 't10-done',
} as const;

type ChatLatencyPoint = (typeof CHAT_LATENCY_POINT)[keyof typeof CHAT_LATENCY_POINT];

const MEASURES = {
  submitToFetch: ['submit-to-fetch', CHAT_LATENCY_POINT.submit, CHAT_LATENCY_POINT.fetch],
  fetchToFirstChunk: [
    'fetch-to-first-chunk',
    CHAT_LATENCY_POINT.fetch,
    CHAT_LATENCY_POINT.firstChunk,
  ],
  firstChunkToFirstPaint: [
    'first-chunk-to-first-paint',
    CHAT_LATENCY_POINT.firstChunk,
    CHAT_LATENCY_POINT.firstPaint,
  ],
  submitToFirstPaint: [
    'submit-to-first-paint',
    CHAT_LATENCY_POINT.submit,
    CHAT_LATENCY_POINT.firstPaint,
  ],
  submitToFirstSentence: [
    'submit-to-first-sentence',
    CHAT_LATENCY_POINT.submit,
    CHAT_LATENCY_POINT.firstSentence,
  ],
  firstPaintToFirstSentence: [
    'first-paint-to-first-sentence',
    CHAT_LATENCY_POINT.firstPaint,
    CHAT_LATENCY_POINT.firstSentence,
  ],
  firstSentenceToDone: [
    'first-sentence-to-done',
    CHAT_LATENCY_POINT.firstSentence,
    CHAT_LATENCY_POINT.done,
  ],
  submitToDone: ['submit-to-done', CHAT_LATENCY_POINT.submit, CHAT_LATENCY_POINT.done],
} as const;

const RETAINED_TRACE_COUNT = 20;
const retainedTraceIds: string[] = [];
const SENTENCE_BOUNDARY = /[.!?](?:["')\]]+)?(?:\s|$)/u;

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function markName(traceId: string, point: ChatLatencyPoint): string {
  return `agi.chat.${traceId}.${point}`;
}

function measureName(traceId: string, measure: string): string {
  return `agi.chat.${traceId}.${measure}`;
}

function clearTrace(traceId: string): void {
  if (typeof performance === 'undefined') return;
  for (const point of Object.values(CHAT_LATENCY_POINT)) {
    performance.clearMarks(markName(traceId, point));
  }
  for (const [measure] of Object.values(MEASURES)) {
    performance.clearMeasures(measureName(traceId, measure));
  }
}

function retainTrace(traceId: string): void {
  retainedTraceIds.push(traceId);
  while (retainedTraceIds.length > RETAINED_TRACE_COUNT) {
    const expired = retainedTraceIds.shift();
    if (expired) clearTrace(expired);
  }
}

function releaseTrace(traceId: string): void {
  const retainedIndex = retainedTraceIds.indexOf(traceId);
  if (retainedIndex !== -1) retainedTraceIds.splice(retainedIndex, 1);
  clearTrace(traceId);
}

export interface ChatLatencyTrace {
  readonly traceId: string;
  readonly traceparent: string;
  markFetchIssued(): void;
  markFirstChunk(): void;
  scheduleFirstPaint(): void;
  observeAssistantText(content: string): void;
  markDone(): void;
  cancel(): void;
}

export function startChatLatencyTrace(): ChatLatencyTrace {
  const traceId = randomHex(16);
  const spanId = randomHex(8);
  const marked = new Set<ChatLatencyPoint>();
  let paintScheduled = false;
  let cancelled = false;

  retainTrace(traceId);

  const mark = (point: ChatLatencyPoint): void => {
    if (cancelled || marked.has(point) || typeof performance === 'undefined') return;
    try {
      performance.mark(markName(traceId, point));
      marked.add(point);
    } catch {
      return;
    }

    for (const [measure, start, end] of Object.values(MEASURES)) {
      if (end !== point || !marked.has(start)) continue;
      try {
        performance.measure(
          measureName(traceId, measure),
          markName(traceId, start),
          markName(traceId, end),
        );
      } catch {
        continue;
      }
    }
  };

  mark(CHAT_LATENCY_POINT.submit);

  return {
    traceId,
    // The browser joins the server trace but never forces server-side sampling.
    traceparent: `00-${traceId}-${spanId}-00`,
    markFetchIssued: () => mark(CHAT_LATENCY_POINT.fetch),
    markFirstChunk: () => mark(CHAT_LATENCY_POINT.firstChunk),
    scheduleFirstPaint: () => {
      if (cancelled || paintScheduled || marked.has(CHAT_LATENCY_POINT.firstPaint)) return;
      paintScheduled = true;
      const record = () => mark(CHAT_LATENCY_POINT.firstPaint);
      if (typeof globalThis.requestAnimationFrame === 'function') {
        globalThis.requestAnimationFrame(record);
      } else {
        record();
      }
    },
    observeAssistantText: (content) => {
      if (SENTENCE_BOUNDARY.test(content)) mark(CHAT_LATENCY_POINT.firstSentence);
    },
    markDone: () => mark(CHAT_LATENCY_POINT.done),
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      releaseTrace(traceId);
    },
  };
}

export function chatLatencyMarkName(traceId: string, point: ChatLatencyPoint): string {
  return markName(traceId, point);
}

export function chatLatencyMeasureName(traceId: string, measure: keyof typeof MEASURES): string {
  return measureName(traceId, MEASURES[measure][0]);
}
