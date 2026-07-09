import 'server-only';

/**
 * Wraps an SSE `ReadableStream` body with a provider-independent idle
 * heartbeat: an `: keepalive\n\n` SSE comment line emitted whenever
 * `intervalMs` has elapsed with no real bytes forwarded.
 *
 * WHY: the legacy Anthropic raw-fetch pipeline forwarded Anthropic's own
 * `event: ping` frames during long silent periods (e.g. extended thinking
 * with no visible output), which kept intermediary/client connections from
 * idle-timing-out. The `@anthropic-ai/sdk`'s `messages.stream()` helper
 * swallows `ping` events internally and unconditionally before
 * `translateAnthropicStream` ever sees them (verified in the SDK source:
 * `core/streaming.ts`'s `if (sse.event === 'ping') continue`) -- there is no
 * way to recover Anthropic's own pings from the adapter path. Rather than
 * chase a provider-specific pings-preserving mechanism (Anthropic-only, and
 * fragile -- every OTHER provider has the same theoretical idle-timeout
 * exposure and none of them forward pings today either), this generates a
 * heartbeat independently of what any upstream provider does or doesn't
 * send. Reported to team-lead as part of task #34's Anthropic slice
 * (2026-07-09); this is the follow-up hardening they asked for.
 *
 * `: keepalive` is an SSE COMMENT (leading colon), not a `data:`/`event:`
 * line -- every SSE parser (spec-compliant EventSource or a hand-rolled
 * `data:`-line filter, which is what all 4 of this endpoint's pinned
 * consumers use, per task #34's client-parsing survey) ignores it by
 * construction. It cannot be mistaken for content or change `finish_reason`/
 * usage/billing math, since none of those read anything outside `data:`
 * lines.
 *
 * Applies to the WHOLE route, not just Anthropic: wrap the final body
 * ReadableStream right before constructing the NextResponse, regardless of
 * which upstream pipeline produced it.
 */
export function withSseHeartbeat(
  source: ReadableStream<Uint8Array>,
  intervalMs = 15_000,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const heartbeat = encoder.encode(': keepalive\n\n');
  const reader = source.getReader();
  // Checked more often than intervalMs so "idle for >= intervalMs" is
  // detected close to on-time, without firing a heartbeat on every check.
  const checkEveryMs = Math.min(intervalMs, 5_000);

  let lastActivityAt = Date.now();
  let timer: ReturnType<typeof setInterval> | null = null;
  let settled = false;

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
      settled = true;
      stopTimer();
      await reader.cancel(reason);
    },
  });
}
