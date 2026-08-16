import 'server-only';

export function withSseHeartbeat(
  source: ReadableStream<Uint8Array>,
  intervalMs = 15_000,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const heartbeat = encoder.encode(': keepalive\n\n');
  const reader = source.getReader();
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
