export interface BatchQueueOptions<T> {
  batchSize: number;
  concurrency: number;
  delayMs: number;
  jitterMs: number;
  run: (batch: readonly T[]) => Promise<void>;
  onError: (error: unknown) => void;
  random?: () => number;
}

export interface EnqueueOptions {
  urgent?: boolean;
}

export interface BatchQueue<T> {
  enqueue(item: T, options?: EnqueueOptions): Promise<void>;
  prioritize(item: T): void;
}

interface Entry<T> {
  item: T;
  settle: () => void;
}

export function createBatchQueue<T>(options: BatchQueueOptions<T>): BatchQueue<T> {
  const queued: Array<Entry<T>> = [];
  const urgent: Array<Entry<T>> = [];
  const random = options.random ?? Math.random;
  let inFlight = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function pendingCount(): number {
    return queued.length + urgent.length;
  }

  function takeBatch(): Array<Entry<T>> {
    const reserved = Math.min(queued.length, Math.floor(options.batchSize / 4));
    const front = urgent.splice(0, Math.max(1, options.batchSize - reserved));
    return [...front, ...queued.splice(0, options.batchSize - front.length)];
  }

  function schedule(): void {
    if (timer !== null || pendingCount() === 0 || inFlight >= options.concurrency) return;
    const delay = options.delayMs + Math.floor(random() * options.jitterMs);
    timer = setTimeout(dispatch, delay);
  }

  function dispatch(): void {
    timer = null;
    while (inFlight < options.concurrency && pendingCount() > 0) {
      const batch = takeBatch();
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
    enqueue(item: T, enqueueOptions?: EnqueueOptions): Promise<void> {
      return new Promise<void>((settle) => {
        (enqueueOptions?.urgent ? urgent : queued).push({ item, settle });
        schedule();
      });
    },
    prioritize(item: T): void {
      const index = queued.findIndex((entry) => entry.item === item);
      if (index < 0) return;
      urgent.push(...queued.splice(index, 1));
    },
  };
}
