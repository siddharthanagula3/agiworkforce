import {
  DEFAULT_WORKSPACE_CODE_CONTROLS,
  EFFECTIVE_WORKSPACE_POLICY_SCHEMA_VERSION,
  resolveWorkspaceCodeControls,
  WORKSPACE_CODE_TOGGLE_KEYS,
  WORKSPACE_FEATURES,
  type EffectiveWorkspaceCodeControls,
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

function parseCodeControls(
  value: unknown,
  schemaVersion: unknown,
  governed: boolean,
  organizationId: string | null,
): EffectiveWorkspaceCodeControls | null {
  const current = schemaVersion === EFFECTIVE_WORKSPACE_POLICY_SCHEMA_VERSION;
  if (current && !governed && organizationId === null && value === null) return null;
  const record = isRecord(value) ? value : {};
  const code = resolveWorkspaceCodeControls(DEFAULT_WORKSPACE_CODE_CONTROLS, []);
  for (const key of WORKSPACE_CODE_TOGGLE_KEYS) {
    if (typeof record[key] === 'boolean') code[key] = record[key];
  }
  for (const [key, activeKey] of [
    ['allowedMcpServers', 'mcpRestrictionActive'],
    ['allowedEgressHosts', 'egressRestrictionActive'],
  ] as const) {
    const list = record[key];
    const valid = Array.isArray(list) && list.every((entry) => typeof entry === 'string');
    const known = current && valid && typeof record[activeKey] === 'boolean';
    code[key] = known ? list : [];
    code[activeKey] = !known || record[activeKey] === true || code[key].length > 0;
  }
  if (
    typeof record['allowMcpServers'] !== 'boolean' ||
    (code.mcpRestrictionActive && code.allowedMcpServers.length === 0)
  ) {
    code.allowMcpServers = false;
  }
  const retention = record['sessionRetentionDays'];
  if (retention === null || (typeof retention === 'number' && Number.isFinite(retention))) {
    code.sessionRetentionDays = retention;
  }
  if (typeof record['revision'] === 'number') code.revision = record['revision'];
  if (Array.isArray(record['appliedOverrideIds'])) {
    code.appliedOverrideIds = record['appliedOverrideIds'].filter(
      (entry): entry is string => typeof entry === 'string',
    );
  }
  if (Array.isArray(record['blockingRules'])) {
    code.blockingRules = record['blockingRules'] as EffectiveWorkspaceCodeControls['blockingRules'];
  }
  return code;
}

function parseCountryControls(controls: Record<string, unknown>, schemaVersion: unknown) {
  const raw = controls['allowedCountries'];
  const validCountries =
    Array.isArray(raw) &&
    raw.every((country) => typeof country === 'string' && /^[A-Za-z]{2}$/.test(country));
  const current =
    schemaVersion === 2 || schemaVersion === EFFECTIVE_WORKSPACE_POLICY_SCHEMA_VERSION;
  // Legacy nonempty results may already have reopened an earlier empty intersection.
  if (!validCountries || !current || typeof controls['countryRestrictionActive'] !== 'boolean') {
    return { allowedCountries: [], countryRestrictionActive: true };
  }
  const allowedCountries = (raw as string[]).map((country) => country.toUpperCase());
  return {
    allowedCountries,
    countryRestrictionActive:
      controls['countryRestrictionActive'] === true || allowedCountries.length > 0,
  };
}

export function parseEffectiveWorkspacePolicy(
  value: unknown,
): EffectiveWorkspacePolicyResponse | null {
  if (!isRecord(value)) return null;
  const { organizationId, governed, revision, controls } = value;
  if (organizationId !== null && typeof organizationId !== 'string') return null;
  if (typeof governed !== 'boolean' || typeof revision !== 'number') return null;
  const code = parseCodeControls(value['code'], value['schemaVersion'], governed, organizationId);
  if (controls === null) {
    return governed
      ? null
      : { ...(value as unknown as EffectiveWorkspacePolicyResponse), controls: null, code };
  }
  if (!isRecord(controls) || !isRecord(controls['featureAccess'])) return null;
  const featureAccess = controls['featureAccess'];
  if (!WORKSPACE_FEATURES.every((feature) => typeof featureAccess[feature] === 'boolean')) {
    return null;
  }
  return {
    ...(value as unknown as EffectiveWorkspacePolicyResponse),
    controls: {
      ...(controls as unknown as NonNullable<EffectiveWorkspacePolicyResponse['controls']>),
      ...parseCountryControls(controls, value['schemaVersion']),
    },
    code,
  };
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
    return {
      etag:
        policy.schemaVersion === EFFECTIVE_WORKSPACE_POLICY_SCHEMA_VERSION &&
        typeof parsed['etag'] === 'string'
          ? parsed['etag']
          : null,
      policy,
    };
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
      etag =
        policy.schemaVersion === EFFECTIVE_WORKSPACE_POLICY_SCHEMA_VERSION
          ? response.headers.get('etag')
          : null;
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
