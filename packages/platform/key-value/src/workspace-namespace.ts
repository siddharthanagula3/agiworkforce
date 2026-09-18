import {
  KeyValueConfigError,
  type KeyValueBatch,
  type KeyValueHashFields,
  type KeyValueScanOptions,
  type KeyValueScanPage,
  type KeyValueSetOptions,
  type KeyValueSortedEntry,
  type KeyValueStore,
} from './types';

export const WORKSPACE_NAMESPACE_PREFIX = 'ws';
export const PERSONAL_WORKSPACE_SEGMENT = 'personal';

const SEGMENT_SEPARATOR = ':';
const USER_SEGMENT = 'u';
const CACHE_SEGMENT = 'c';
const MATCH_ALL = '*';
const PURGE_PAGE_SIZE = 256;
const SCAN_START_CURSOR = '0';
const EMPTY_COUNT = 0;

/**
 * A workspace id of `null` is the member's personal workspace, which is a
 * distinct namespace rather than the absence of one.
 */
export interface WorkspaceCacheScope {
  workspaceId: string | null;
  userId?: string;
  cacheId?: string;
}

function assertSegment(value: string, label: string): string {
  if (value.length === EMPTY_COUNT) {
    throw new KeyValueConfigError(`Workspace cache ${label} must not be empty`);
  }
  if (value.includes(SEGMENT_SEPARATOR) || value.includes(MATCH_ALL)) {
    throw new KeyValueConfigError(
      `Workspace cache ${label} must not contain "${SEGMENT_SEPARATOR}" or "${MATCH_ALL}"`,
    );
  }
  return value;
}

export function workspaceCacheNamespace(scope: WorkspaceCacheScope): string {
  const workspace =
    scope.workspaceId === null
      ? PERSONAL_WORKSPACE_SEGMENT
      : assertSegment(scope.workspaceId, 'workspace id');
  const segments = [WORKSPACE_NAMESPACE_PREFIX, workspace];
  if (scope.userId !== undefined) {
    segments.push(USER_SEGMENT, assertSegment(scope.userId, 'user id'));
  }
  if (scope.cacheId !== undefined) {
    segments.push(CACHE_SEGMENT, assertSegment(scope.cacheId, 'cache id'));
  }
  return segments.join(SEGMENT_SEPARATOR);
}

export function workspaceCacheKey(scope: WorkspaceCacheScope, key: string): string {
  if (key.length === EMPTY_COUNT) {
    throw new KeyValueConfigError('Workspace cache key must not be empty');
  }
  return `${workspaceCacheNamespace(scope)}${SEGMENT_SEPARATOR}${key}`;
}

export function workspaceCacheMatch(scope: WorkspaceCacheScope): string {
  return `${workspaceCacheNamespace(scope)}${SEGMENT_SEPARATOR}${MATCH_ALL}`;
}

export function isWorkspaceScopedKey(key: string, scope: WorkspaceCacheScope): boolean {
  return key.startsWith(`${workspaceCacheNamespace(scope)}${SEGMENT_SEPARATOR}`);
}

export function readWorkspaceScopedKey(key: string, scope: WorkspaceCacheScope): string | null {
  const prefix = `${workspaceCacheNamespace(scope)}${SEGMENT_SEPARATOR}`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : null;
}

function wrapBatch(batch: KeyValueBatch, prefix: (key: string) => string): KeyValueBatch {
  const wrapped: KeyValueBatch = {
    get(key) {
      batch.get(prefix(key));
      return wrapped;
    },
    set(key, value, options) {
      batch.set(prefix(key), value, options);
      return wrapped;
    },
    increment(key, amount) {
      batch.increment(prefix(key), amount);
      return wrapped;
    },
    expire(key, ttlSeconds) {
      batch.expire(prefix(key), ttlSeconds);
      return wrapped;
    },
    expireIn(key, ttlMilliseconds) {
      batch.expireIn(prefix(key), ttlMilliseconds);
      return wrapped;
    },
    expireAt(key, epochMilliseconds) {
      batch.expireAt(prefix(key), epochMilliseconds);
      return wrapped;
    },
    hashSet(key, fields) {
      batch.hashSet(prefix(key), fields);
      return wrapped;
    },
    hashGetAll(key) {
      batch.hashGetAll(prefix(key));
      return wrapped;
    },
    sortedAdd(key, entry) {
      batch.sortedAdd(prefix(key), entry);
      return wrapped;
    },
    sortedRemoveByScore(key, minScore, maxScore) {
      batch.sortedRemoveByScore(prefix(key), minScore, maxScore);
      return wrapped;
    },
    sortedRangeByScore(key, minScore, maxScore) {
      batch.sortedRangeByScore(prefix(key), minScore, maxScore);
      return wrapped;
    },
    exec: () => batch.exec(),
  };
  return wrapped;
}

/**
 * Every key a caller addresses through this store is rewritten into the scope's
 * namespace, so a request bound to one workspace cannot name another's key even
 * with an attacker-chosen suffix.
 */
export function createWorkspaceKeyValueStore(
  store: KeyValueStore,
  scope: WorkspaceCacheScope,
): KeyValueStore {
  const prefix = (key: string): string => workspaceCacheKey(scope, key);
  const namespacePrefix = `${workspaceCacheNamespace(scope)}${SEGMENT_SEPARATOR}`;

  return {
    get: <T>(key: string): Promise<T | null> => store.get<T>(prefix(key)),
    set: (key: string, value: unknown, options?: KeyValueSetOptions): Promise<boolean> =>
      store.set(prefix(key), value, options),
    delete: (...keys: string[]): Promise<number> => store.delete(...keys.map(prefix)),
    increment: (key: string, amount?: number): Promise<number> =>
      store.increment(prefix(key), amount),
    expire: (key: string, ttlSeconds: number): Promise<void> =>
      store.expire(prefix(key), ttlSeconds),
    hashSet: (key: string, fields: KeyValueHashFields): Promise<void> =>
      store.hashSet(prefix(key), fields),
    hashGetAll: <T>(key: string): Promise<T | null> => store.hashGetAll<T>(prefix(key)),
    setAdd: (key: string, member: string): Promise<void> => store.setAdd(prefix(key), member),
    setRemove: (key: string, member: string): Promise<void> => store.setRemove(prefix(key), member),
    setSize: (key: string): Promise<number> => store.setSize(prefix(key)),
    sortedAdd: (key: string, entry: KeyValueSortedEntry): Promise<void> =>
      store.sortedAdd(prefix(key), entry),
    sortedRemove: (key: string, member: string): Promise<void> =>
      store.sortedRemove(prefix(key), member),
    sortedRemoveByScore: (key: string, minScore: number, maxScore: number): Promise<void> =>
      store.sortedRemoveByScore(prefix(key), minScore, maxScore),
    sortedSize: (key: string): Promise<number> => store.sortedSize(prefix(key)),
    async scan(cursor: string, options: KeyValueScanOptions): Promise<KeyValueScanPage> {
      const page = await store.scan(cursor, {
        ...options,
        match: `${namespacePrefix}${options.match}`,
      });
      return {
        cursor: page.cursor,
        keys: page.keys.flatMap((key) => {
          const relative = readWorkspaceScopedKey(key, scope);
          return relative === null ? [] : [relative];
        }),
      };
    },
    batch: (): KeyValueBatch => wrapBatch(store.batch(), prefix),
  };
}

export interface PurgeWorkspaceCacheOptions {
  pageSize?: number;
}

/**
 * Deletes every key in the scope. Callers treat the returned count as a metric,
 * not as proof of completeness: a scan can miss a key written while it runs.
 */
export async function purgeWorkspaceCache(
  store: KeyValueStore,
  scope: WorkspaceCacheScope,
  options: PurgeWorkspaceCacheOptions = {},
): Promise<number> {
  const match = workspaceCacheMatch(scope);
  const count = options.pageSize ?? PURGE_PAGE_SIZE;
  let cursor = SCAN_START_CURSOR;
  let deleted = EMPTY_COUNT;

  do {
    const page = await store.scan(cursor, { match, count });
    cursor = page.cursor;
    if (page.keys.length > EMPTY_COUNT) {
      deleted += await store.delete(...page.keys);
    }
  } while (cursor !== SCAN_START_CURSOR);

  return deleted;
}
