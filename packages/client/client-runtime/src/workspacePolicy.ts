import {
  WORKSPACE_FEATURES,
  type EffectiveWorkspacePolicyResponse,
  type WorkspaceFeature,
} from '@agiworkforce/types';

export const WORKSPACE_POLICY_POLL_INTERVAL_MS = 60_000;

export type WorkspacePolicySource = 'network' | 'cache' | 'none';

export interface WorkspacePolicySnapshot {
  policy: EffectiveWorkspacePolicyResponse | null;
  source: WorkspacePolicySource;
  stale: boolean;
  checkedAt: number | null;
}

export interface WorkspacePolicyCache {
  read(): string | null;
  write(value: string | null): void;
}

export interface WorkspacePolicyPollerOptions {
  request: (headers: Record<string, string>) => Promise<Response>;
  cache?: WorkspacePolicyCache | null;
  intervalMs?: number;
  now?: () => number;
  environment?: WorkspacePolicyEnvironment | null;
}

export interface WorkspacePolicyEnvironment {
  isVisible(): boolean;
  onResume(listener: () => void): () => void;
}

export interface WorkspacePolicyPoller {
  getSnapshot(): WorkspacePolicySnapshot;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<WorkspacePolicySnapshot>;
  start(): () => void;
}

interface CachedPolicy {
  etag: string | null;
  policy: EffectiveWorkspacePolicyResponse;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseEffectiveWorkspacePolicy(
  value: unknown,
): EffectiveWorkspacePolicyResponse | null {
  if (!isRecord(value)) return null;
  const { organizationId, governed, revision, controls } = value;
  if (organizationId !== null && typeof organizationId !== 'string') return null;
  if (typeof governed !== 'boolean' || typeof revision !== 'number') return null;
  if (controls === null) {
    return governed ? null : { organizationId, governed, revision, controls: null };
  }
  if (!isRecord(controls) || !isRecord(controls['featureAccess'])) return null;
  const featureAccess = controls['featureAccess'];
  if (!WORKSPACE_FEATURES.every((feature) => typeof featureAccess[feature] === 'boolean')) {
    return null;
  }
  return value as unknown as EffectiveWorkspacePolicyResponse;
}

function readCache(cache: WorkspacePolicyCache | null | undefined): CachedPolicy | null {
  if (!cache) return null;
  try {
    const raw = cache.read();
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const policy = parseEffectiveWorkspacePolicy(parsed['policy']);
    if (!policy) return null;
    return { etag: typeof parsed['etag'] === 'string' ? parsed['etag'] : null, policy };
  } catch {
    return null;
  }
}

function writeCache(cache: WorkspacePolicyCache | null | undefined, value: CachedPolicy | null) {
  if (!cache) return;
  try {
    cache.write(value ? JSON.stringify(value) : null);
  } catch {
    return;
  }
}

export function isWorkspaceFeatureEnabled(
  policy: EffectiveWorkspacePolicyResponse | null,
  feature: WorkspaceFeature,
): boolean {
  if (!policy?.controls) return true;
  return policy.controls.featureAccess[feature] !== false;
}

export function disabledWorkspaceFeatures(
  policy: EffectiveWorkspacePolicyResponse | null,
): WorkspaceFeature[] {
  return WORKSPACE_FEATURES.filter((feature) => !isWorkspaceFeatureEnabled(policy, feature));
}

export function createWorkspacePolicyPoller(
  options: WorkspacePolicyPollerOptions,
): WorkspacePolicyPoller {
  const now = options.now ?? Date.now;
  const intervalMs = options.intervalMs ?? WORKSPACE_POLICY_POLL_INTERVAL_MS;
  const cached = readCache(options.cache);
  let etag = cached?.etag ?? null;
  let snapshot: WorkspacePolicySnapshot = {
    policy: cached?.policy ?? null,
    source: cached ? 'cache' : 'none',
    stale: Boolean(cached),
    checkedAt: null,
  };
  const listeners = new Set<() => void>();
  let inFlight: Promise<WorkspacePolicySnapshot> | null = null;

  function publish(next: WorkspacePolicySnapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  async function load(): Promise<WorkspacePolicySnapshot> {
    try {
      const response = await options.request(etag ? { 'If-None-Match': etag } : {});
      if (response.status === 304) {
        publish({ ...snapshot, source: 'network', stale: false, checkedAt: now() });
        return snapshot;
      }
      if (response.status === 401) {
        etag = null;
        writeCache(options.cache, null);
        publish({ policy: null, source: 'none', stale: false, checkedAt: now() });
        return snapshot;
      }
      if (!response.ok) {
        publish({ ...snapshot, stale: true, checkedAt: now() });
        return snapshot;
      }
      const policy = parseEffectiveWorkspacePolicy(await response.json());
      if (!policy) {
        publish({ ...snapshot, stale: true, checkedAt: now() });
        return snapshot;
      }
      etag = response.headers.get('etag');
      writeCache(options.cache, { etag, policy });
      publish({ policy, source: 'network', stale: false, checkedAt: now() });
      return snapshot;
    } catch {
      publish({ ...snapshot, stale: true, checkedAt: now() });
      return snapshot;
    }
  }

  function refresh(): Promise<WorkspacePolicySnapshot> {
    if (!inFlight) {
      inFlight = load().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  }

  function start(): () => void {
    const environment = options.environment ?? null;
    void refresh();
    const timer = setInterval(() => {
      if (!environment || environment.isVisible()) void refresh();
    }, intervalMs);
    const stopResume = environment?.onResume(() => void refresh()) ?? (() => undefined);
    return () => {
      clearInterval(timer);
      stopResume();
    };
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    start,
  };
}

export function browserWorkspacePolicyEnvironment(): WorkspacePolicyEnvironment | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  return {
    isVisible: () => document.visibilityState === 'visible',
    onResume(listener) {
      const onVisible = () => {
        if (document.visibilityState === 'visible') listener();
      };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', listener);
      window.addEventListener('focus', listener);
      return () => {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', listener);
        window.removeEventListener('focus', listener);
      };
    },
  };
}

export function localStorageWorkspacePolicyCache(key: string): WorkspacePolicyCache | null {
  if (typeof localStorage === 'undefined') return null;
  return {
    read: () => localStorage.getItem(key),
    write: (value) => {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    },
  };
}
