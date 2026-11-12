export interface BatchQueueOptions<T> {
  batchSize: number;
  concurrency: number;
  delayMs: number;
  jitterMs: number;
  run: (batch: readonly T[]) => Promise<void>;
  onError: (error: unknown) => void;
  random?: () => number;
}

export interface BatchQueue<T> {
  enqueue(item: T): Promise<void>;
}

interface Entry<T> {
  item: T;
  settle: () => void;
}

export function createBatchQueue<T>(options: BatchQueueOptions<T>): BatchQueue<T> {
  const queued: Array<Entry<T>> = [];
  const random = options.random ?? Math.random;
  let inFlight = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule(): void {
    if (timer !== null || queued.length === 0 || inFlight >= options.concurrency) return;
    const delay = options.delayMs + Math.floor(random() * options.jitterMs);
    timer = setTimeout(dispatch, delay);
  }

  function dispatch(): void {
    timer = null;
    while (inFlight < options.concurrency && queued.length > 0) {
      const batch = queued.splice(0, options.batchSize);
      inFlight += 1;
      void options
        .run(batch.map((entry) => entry.item))
        .catch(options.onError)
        .finally(() => {
          inFlight -= 1;
          for (const entry of batch) entry.settle();
          schedule();
        });
    }
  }

  return {
    enqueue(item: T): Promise<void> {
      return new Promise<void>((settle) => {
        queued.push({ item, settle });
        schedule();
      });
    },
  };
}
