'use client';

import { MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH } from '@agiworkforce/cloud-contracts';

import { createRequestAuthority, type RequestAuthority, type SessionAuthority } from '@/lib/identity/request-authority';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { apiErrorMessage } from '@/shared/utils/api-error';

export const PREFERENCE_NAMESPACE_SAVED_EVENT = 'agi:preference-namespace-saved';

export interface PreferenceNamespaceSavedDetail {
  namespace: string;
  value: unknown;
}

const PREFERENCES_SNAPSHOT_TTL_MS = 60_000;

let snapshotInFlight: Promise<Record<string, unknown>> | null = null;
let snapshotLoadedAt = 0;
let storedVersion: string | null = null;
let organizationMemoryAllowed = true;
let autonomousToolApprovalsAllowed = false;

export interface PreferenceOwner {
  readonly session: SessionAuthority;
  readonly incarnation: number;
  isCurrent: () => boolean;
}

export interface OwnedPreferencesSnapshot {
  settings: Record<string, unknown>;
  version: string | null;
}

interface OwnedSnapshotEntry {
  owner: PreferenceOwner;
  generation: number;
  loadedAt: number;
  pending: boolean;
  authority: RequestAuthority;
  promise: Promise<OwnedPreferencesSnapshot>;
}

let preferenceOwner: PreferenceOwner | null = null;
let preferenceIncarnation = 0;
let ownedSnapshotGeneration = 0;
let ownedSnapshot: OwnedSnapshotEntry | null = null;

export function observePreferenceOwner(session: SessionAuthority | null): PreferenceOwner | null {
  if (preferenceOwner?.isCurrent() && session?.isCurrent() &&
      preferenceOwner.session.userId === session.userId &&
      preferenceOwner.session.sessionId === session.sessionId) return preferenceOwner;
  if (!preferenceOwner && !session) return null;
  invalidateOwnedPreferencesSnapshot();
  preferenceOwner = null;
  if (!session?.isCurrent()) return null;
  const candidate: PreferenceOwner = {
    session,
    incarnation: ++preferenceIncarnation,
    isCurrent: () => preferenceOwner === candidate && session.isCurrent(),
  };
  preferenceOwner = candidate;
  return candidate;
}

function assertPreferenceOwner(owner: PreferenceOwner): void {
  if (!owner.isCurrent()) throw new DOMException('Preference owner changed', 'AbortError');
}

function invalidateOwnedPreferencesSnapshot(): void {
  ownedSnapshotGeneration += 1;
  ownedSnapshot?.authority.retire();
  ownedSnapshot = null;
}

function expireOwnedPreferencesSnapshot(owner?: PreferenceOwner): void {
  if (ownedSnapshot && (!owner || ownedSnapshot.owner === owner)) {
    ownedSnapshot.loadedAt = Number.NEGATIVE_INFINITY;
  }
}

export function readOwnedPreferences(owner: PreferenceOwner): Promise<OwnedPreferencesSnapshot> {
  if (!owner.isCurrent()) return Promise.reject(new DOMException('Preference owner changed', 'AbortError'));
  if (ownedSnapshot?.owner === owner &&
      (ownedSnapshot.pending || Date.now() - ownedSnapshot.loadedAt < PREFERENCES_SNAPSHOT_TTL_MS)) {
    return ownedSnapshot.promise;
  }
  invalidateOwnedPreferencesSnapshot();
  const generation = ownedSnapshotGeneration;
  const authority = createRequestAuthority(owner.session, () =>
    owner.isCurrent() && ownedSnapshot === entry && generation === ownedSnapshotGeneration);
  const entry: OwnedSnapshotEntry = {
    owner, generation, loadedAt: Date.now(), pending: true, authority,
    promise: Promise.resolve({ settings: {}, version: null }),
  };
  ownedSnapshot = entry;
  entry.promise = (async () => {
    try {
      const response = await authority.fetch(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, { cache: 'no-store' });
      const data = await (response.ok ? response.json() : response.json().catch(() => null)) as {
        settings?: unknown; version?: unknown;
      } | null;
      authority.assertCurrent();
      if (!response.ok) throw new Error(apiErrorMessage(data, 'Failed to load settings'));
      return {
        settings: data?.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
          ? data.settings as Record<string, unknown> : {},
        version: readVersion(data?.version),
      };
    } catch (error) {
      if (ownedSnapshot === entry && ownedSnapshotGeneration === generation) ownedSnapshot = null;
      throw error;
    } finally {
      entry.pending = false;
    }
  })();
  return entry.promise;
}

export async function fetchOwnedPreferenceNamespace<T extends object>(
  owner: PreferenceOwner, namespace: string,
): Promise<Partial<T>> {
  const snapshot = await readOwnedPreferences(owner);
  assertPreferenceOwner(owner);
  const value = snapshot.settings[namespace];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Partial<T> : {};
}

export async function saveOwnedPreferenceNamespace<T extends object>(
  owner: PreferenceOwner, namespace: string, value: T,
  options?: Omit<PreferenceSaveOptions, 'authority'>,
): Promise<PreferenceSaveResult> {
  assertPreferenceOwner(owner);
  const captured = structuredClone(value);
  const authority = createRequestAuthority(owner.session, owner.isCurrent);
  try {
    const result = await savePreferenceNamespace(namespace, captured, { ...options, authority });
    authority.assertCurrent();
    expireOwnedPreferencesSnapshot(owner);
    return result;
  } catch (error) {
    if (authority.isCurrent() && error instanceof PreferenceVersionConflictError) {
      expireOwnedPreferencesSnapshot(owner);
    }
    throw error;
  } finally {
    authority.retire();
  }
}

export class PreferenceVersionConflictError extends Error {
  readonly namespace: string;
  readonly settings: unknown;
  readonly version: string | null;

  constructor(params: {
    message: string;
    namespace: string;
    settings: unknown;
    version: string | null;
  }) {
    super(params.message);
    this.name = 'PreferenceVersionConflictError';
    this.namespace = params.namespace;
    this.settings = params.settings;
    this.version = params.version;
  }
}

function readVersion(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

async function requestPreferencesSnapshot(): Promise<Record<string, unknown>> {
  const response = await fetch(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(
      apiErrorMessage(await response.json().catch(() => null), 'Failed to load settings'),
    );
  }
  const data = (await response.json()) as {
    settings?: unknown;
    version?: unknown;
    organizationMemoryAllowed?: unknown;
    autonomousToolApprovalsAllowed?: unknown;
  };
  storedVersion = readVersion(data.version);
  organizationMemoryAllowed = data.organizationMemoryAllowed !== false;
  autonomousToolApprovalsAllowed = data.autonomousToolApprovalsAllowed === true;
  return data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
    ? (data.settings as Record<string, unknown>)
    : {};
}

export async function readPreferencesVersion(): Promise<string | null> {
  await loadPreferencesSnapshot();
  return storedVersion;
}

export async function readOrganizationMemoryAllowed(): Promise<boolean> {
  await loadPreferencesSnapshot();
  return organizationMemoryAllowed;
}

// The workspace answers this, never the client. A snapshot that will not load
// leaves the answer at its fail-closed initial value.
export async function readAutonomousToolApprovalsAllowed(): Promise<boolean> {
  await loadPreferencesSnapshot();
  return autonomousToolApprovalsAllowed;
}

function loadPreferencesSnapshot(): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (snapshotInFlight && now - snapshotLoadedAt < PREFERENCES_SNAPSHOT_TTL_MS) {
    return snapshotInFlight;
  }
  snapshotLoadedAt = now;
  const pending = requestPreferencesSnapshot().catch((error: unknown) => {
    if (snapshotInFlight === pending) {
      snapshotInFlight = null;
      snapshotLoadedAt = 0;
    }
    throw error;
  });
  snapshotInFlight = pending;
  return snapshotInFlight;
}

export function invalidatePreferencesSnapshot(): void {
  invalidateLegacyPreferencesSnapshot();
  expireOwnedPreferencesSnapshot();
}

function invalidateLegacyPreferencesSnapshot(): void {
  snapshotInFlight = null;
  snapshotLoadedAt = 0;
}

export async function fetchStoredPreferenceNamespace<T extends object>(
  namespace: string,
): Promise<Partial<T>> {
  const snapshot = await loadPreferencesSnapshot();
  const value = snapshot[namespace];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<T>) : {};
}

export async function fetchPreferenceNamespace<T extends object>(
  namespace: string,
  fallback: T,
): Promise<T> {
  const stored = await fetchStoredPreferenceNamespace<T>(namespace);
  return { ...fallback, ...stored } as T;
}

export async function saveDisplayName(displayName: string): Promise<void> {
  const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
  const response = await fetch('/api/me', {
    method: 'PATCH',
    headers,
    credentials: 'include',
    body: JSON.stringify({ display_name: displayName }),
  });
  if (!response.ok) {
    throw new Error(
      apiErrorMessage(await response.json().catch(() => null), 'Failed to save your name'),
    );
  }
}

export async function refreshProfileConsumers(): Promise<void> {
  const [{ useBillingStore }, { useAuthStore }] = await Promise.all([
    import('@shared/stores/web-auth-store'),
    import('@shared/stores/authentication-store'),
  ]);
  await Promise.all([
    useBillingStore.getState().refreshUser(),
    useAuthStore.getState().fetchUser(),
  ]);
}

export interface PreferenceSaveOptions {
  authority?: RequestAuthority;
  /** Merge into the stored namespace instead of replacing it. */
  merge?: boolean;
  /** Refuse the write, with a conflict, if the stored revision moved on. */
  expectedVersion?: string | null;
  keepalive?: boolean;
}

export interface PreferenceSaveResult {
  version: string | null;
}

export async function savePreferenceNamespace<T extends object>(
  namespace: string,
  value: T,
  options?: PreferenceSaveOptions,
): Promise<PreferenceSaveResult> {
  const authority = options?.authority;
  authority?.assertCurrent();
  const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
  authority?.assertCurrent();
  const response = await (authority?.fetch ?? fetch)(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, {
    method: 'PUT',
    headers,
    credentials: 'include',
    keepalive: options?.keepalive === true,
    body: JSON.stringify({
      namespace,
      ...(options?.merge ? { patch: value } : { value }),
      ...(options?.expectedVersion === undefined
        ? {}
        : { expectedVersion: options.expectedVersion }),
    }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      settings?: unknown;
      version?: unknown;
    };
    authority?.assertCurrent();
    const message = apiErrorMessage(data, 'Failed to save settings');
    if (response.status === 412) {
      invalidateLegacyPreferencesSnapshot();
      throw new PreferenceVersionConflictError({
        message,
        namespace,
        settings: data.settings,
        version: readVersion(data.version),
      });
    }
    throw new Error(message);
  }

  const data = (await response.json().catch(() => ({}))) as { version?: unknown };
  authority?.assertCurrent();
  invalidateLegacyPreferencesSnapshot();
  const version = readVersion(data.version);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<PreferenceNamespaceSavedDetail>(PREFERENCE_NAMESPACE_SAVED_EVENT, {
        detail: { namespace, value },
      }),
    );
  }

  return { version };
}
