export type DeadlineOutcome<T> =
  { kind: 'settled'; value: T } | { kind: 'failed' } | { kind: 'timeout' };

export async function withinDeadline<T>(
  work: Promise<T>,
  timeoutMs: number,
): Promise<DeadlineOutcome<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<DeadlineOutcome<T>>((resolve) => {
    timer = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
  });
  try {
    return await Promise.race([
      work.then(
        (value): DeadlineOutcome<T> => ({ kind: 'settled', value }),
        (): DeadlineOutcome<T> => ({ kind: 'failed' }),
      ),
      expiry,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
