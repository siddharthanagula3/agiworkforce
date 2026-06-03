export type FetchWithTimeoutInit = RequestInit & {
  timeoutMs?: number;
};

export async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: FetchWithTimeoutInit = {},
): Promise<Response> {
  const { timeoutMs = 10_000, signal, ...requestInit } = init;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', abortFromCaller, { once: true });
    }
  }

  try {
    return await fetch(input, {
      ...requestInit,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}
