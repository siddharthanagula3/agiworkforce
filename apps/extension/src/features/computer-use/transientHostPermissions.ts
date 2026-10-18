import { normalizeApprovedSiteOrigin } from '../options/site-allowlist';
import { ONE_TIME_SITE_GRANT_MAX_MS } from './oneTimeSiteGrants';

export const TRANSIENT_HOST_PERMISSIONS_STORAGE_KEY = 'agi_transient_host_permissions';

export interface TransientHostPermission {
  id: string;
  origin: string;
  expiresAtMs: number;
}

export interface TransientHostPermissionStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function sessionStorage(): TransientHostPermissionStorage {
  return {
    get: (key) => chrome.storage.session.get(key) as Promise<Record<string, unknown>>,
    set: (items) => chrome.storage.session.set(items),
  };
}

let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

function sanitize(value: unknown): TransientHostPermission[] {
  if (!Array.isArray(value)) return [];
  const entries: TransientHostPermission[] = [];
  for (const candidate of value as Array<Partial<TransientHostPermission> | null>) {
    if (!candidate || typeof candidate.id !== 'string' || typeof candidate.origin !== 'string')
      continue;
    const origin = normalizeApprovedSiteOrigin(candidate.origin);
    if (!origin || typeof candidate.expiresAtMs !== 'number') continue;
    entries.push({ id: candidate.id, origin, expiresAtMs: candidate.expiresAtMs });
  }
  return entries;
}

export async function listTransientHostPermissions(
  storage: TransientHostPermissionStorage = sessionStorage(),
): Promise<TransientHostPermission[]> {
  const result = await storage.get(TRANSIENT_HOST_PERMISSIONS_STORAGE_KEY);
  return sanitize(result?.[TRANSIENT_HOST_PERMISSIONS_STORAGE_KEY]);
}

export function recordTransientHostPermission(
  id: string,
  origin: string,
  storage: TransientHostPermissionStorage = sessionStorage(),
  nowMs = Date.now(),
): Promise<void> {
  const normalized = normalizeApprovedSiteOrigin(origin);
  if (!normalized) return Promise.resolve();
  return serialized(async () => {
    const entries = (await listTransientHostPermissions(storage)).filter(
      (entry) => entry.id !== id,
    );
    entries.push({ id, origin: normalized, expiresAtMs: nowMs + ONE_TIME_SITE_GRANT_MAX_MS });
    await storage.set({ [TRANSIENT_HOST_PERMISSIONS_STORAGE_KEY]: entries });
  });
}

export function forgetTransientHostPermissions(
  ids: readonly string[],
  storage: TransientHostPermissionStorage = sessionStorage(),
): Promise<TransientHostPermission[]> {
  return serialized(async () => {
    const entries = await listTransientHostPermissions(storage);
    const removed = entries.filter((entry) => ids.includes(entry.id));
    if (removed.length === 0) return removed;
    await storage.set({
      [TRANSIENT_HOST_PERMISSIONS_STORAGE_KEY]: entries.filter((entry) => !ids.includes(entry.id)),
    });
    return removed;
  });
}

export interface TransientSweepInput {
  entries: readonly TransientHostPermission[];
  keptOrigins: ReadonlySet<string>;
  heldOrigins: ReadonlySet<string>;
  nowMs: number;
  expiredOnly: boolean;
}

export interface TransientSweepPlan {
  forgetIds: string[];
  removeOrigins: string[];
}

export function planTransientSweep(input: TransientSweepInput): TransientSweepPlan {
  const releasable = input.entries.filter(
    (entry) =>
      (!input.expiredOnly || entry.expiresAtMs <= input.nowMs) &&
      !input.heldOrigins.has(entry.origin),
  );
  const forgetIds = releasable.map((entry) => entry.id);
  const staying = input.entries.filter((entry) => !forgetIds.includes(entry.id));
  const removeOrigins = [
    ...new Set(
      releasable
        .map((entry) => entry.origin)
        .filter(
          (origin) =>
            !input.keptOrigins.has(origin) && !staying.some((entry) => entry.origin === origin),
        ),
    ),
  ];
  return { forgetIds, removeOrigins };
}
