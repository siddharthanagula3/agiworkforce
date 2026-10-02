const MS_PER_SECOND = 1_000;

interface StoredEntry {
  body: string;
  storedAtMs: number;
}

export interface StaleWhileRevalidateCache {
  unstable_cache: <TArgs extends unknown[], TResult>(
    compute: (...args: TArgs) => Promise<TResult>,
    keyParts?: readonly string[],
    options?: { revalidate?: number | false },
  ) => (...args: TArgs) => Promise<TResult>;
  size: () => number;
  clear: () => void;
  settle: () => Promise<void>;
}

export function createStaleWhileRevalidateCache(): StaleWhileRevalidateCache {
  const entries = new Map<string, StoredEntry>();
  const revalidations: Promise<unknown>[] = [];

  const store = (key: string, value: unknown) =>
    entries.set(key, { body: JSON.stringify(value), storedAtMs: Date.now() });

  return {
    unstable_cache:
      (compute, keyParts = [], options = {}) =>
      async (...args) => {
        const key = [...keyParts, JSON.stringify(args)].join('|');
        const entry = entries.get(key);
        if (!entry) {
          const value = await compute(...args);
          store(key, value);
          return value;
        }
        const windowMs =
          typeof options.revalidate === 'number' ? options.revalidate * MS_PER_SECOND : Infinity;
        if (Date.now() - entry.storedAtMs > windowMs) {
          revalidations.push(
            compute(...args).then(
              (value) => store(key, value),
              () => undefined,
            ),
          );
        }
        return JSON.parse(entry.body);
      },
    size: () => entries.size,
    clear: () => entries.clear(),
    settle: async () => {
      await Promise.all(revalidations.splice(0));
    },
  };
}
