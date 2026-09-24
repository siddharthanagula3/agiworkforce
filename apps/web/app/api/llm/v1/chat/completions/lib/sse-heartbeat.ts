import 'server-only';

import { logger } from '@/lib/logger';
import { recordFailure } from '@/lib/observability/metrics';

export const SSE_HEARTBEAT_INTERVAL_MS = 2_000;

export const SSE_RESPONSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

export interface SseDisconnect {
  /** Bytes forwarded before the reader went away, so a drop at zero is visible. */
  bytesDelivered: number;
  elapsedMs: number;
  reason: string;
}

export type SseDisconnectObserver = (disconnect: SseDisconnect) => void;

function reportSseDisconnect(disconnect: SseDisconnect): void {
  recordFailure('api', 'stream_disconnected');
  logger.warn({ event: 'sse_stream_disconnected', ...disconnect }, 'SSE stream dropped by client');
}

export function withSseHeartbeat(
  source: ReadableStream<Uint8Array>,
  intervalMs = SSE_HEARTBEAT_INTERVAL_MS,
  onDisconnect: SseDisconnectObserver = reportSseDisconnect,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const heartbeat = encoder.encode(': keepalive\n\n');
  const reader = source.getReader();
  const checkEveryMs = Math.min(intervalMs, 5_000);

  const openedAt = Date.now();
  let lastActivityAt = openedAt;
  let timer: ReturnType<typeof setInterval> | null = null;
  let settled = false;
  let bytesDelivered = 0;

  function stopTimer(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      timer = setInterval(() => {
        if (settled || Date.now() - lastActivityAt < intervalMs) return;
        try {
          controller.enqueue(heartbeat);
          lastActivityAt = Date.now();
        } catch {
          // Controller already closed/errored by a race with the read loop
          // below -- the loop's own close()/error() path already stops the
          // timer; nothing further to do here.
        }
      }, checkEveryMs);

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            controller.enqueue(value);
            bytesDelivered += value.byteLength;
            lastActivityAt = Date.now();
          }
        }
        settled = true;
        controller.close();
      } catch (err) {
        settled = true;
        controller.error(err);
      } finally {
        stopTimer();
      }
    },
    async cancel(reason) {
      // Cancel before the source ended is the client leaving mid-answer, which
      // is the only disconnect this layer can see. A finished stream is not one.
      if (!settled) {
        onDisconnect({
          bytesDelivered,
          elapsedMs: Date.now() - openedAt,
          reason: reason === undefined ? 'client_cancelled' : String(reason),
        });
      }
      settled = true;
      stopTimer();
      await reader.cancel(reason);
    },
  });
}
