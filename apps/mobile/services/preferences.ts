/**
 * Account preference namespaces.
 *
 * Web stores several cross-surface settings as namespaced JSON blobs under
 * GET/PUT /api/settings/preferences. Mobile never called that endpoint, so
 * every namespaced preference the user set on web was invisible here (and
 * every mobile equivalent was device-local and invisible on web). This is the
 * mobile side of the same contract — same endpoint, same request shape.
 *
 * TRUST BOUNDARY: these are ACCOUNT settings. Callers must only reach for them
 * in Cloud Mode; Local Mode has no account and must keep using its device-local
 * store.
 */
import { api } from '@/services/api';

interface PreferenceReadResponse {
  settings?: unknown;
}

/**
 * Read a namespace and return EXACTLY what the server stored.
 *
 * Deliberately does not merge a client-side fallback: callers normalize the
 * raw value with the namespace's own contract (e.g.
 * `normalizeTimeFocusPreferences`), which is the single definition of what a
 * missing or malformed field means. Merging defaults here would make "the user
 * cleared this" indistinguishable from "the server has never been told".
 */
export async function fetchPreferenceNamespace(namespace: string): Promise<unknown> {
  const data = await api.get<PreferenceReadResponse>(
    `/api/settings/preferences?namespace=${encodeURIComponent(namespace)}`,
  );
  const settings = data?.settings;
  return settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
}

export async function savePreferenceNamespace<T extends object>(
  namespace: string,
  value: T,
): Promise<void> {
  await api.put('/api/settings/preferences', { namespace, value });
}

/**
 * The same endpoint also carries un-namespaced account settings (the
 * `{ settings }` body shape) — `session_timeout`, `two_factor_enabled` and
 * friends. Reads without a `namespace` query return that top-level document.
 *
 * The server persists only the delta it is given, so a partial write here
 * cannot clobber a key this app does not know about.
 */
export async function fetchAccountSettings(): Promise<Record<string, unknown>> {
  const data = await api.get<PreferenceReadResponse>('/api/settings/preferences');
  const settings = data?.settings;
  return settings && typeof settings === 'object' && !Array.isArray(settings)
    ? (settings as Record<string, unknown>)
    : {};
}

export async function saveAccountSettings(settings: Record<string, unknown>): Promise<void> {
  await api.put('/api/settings/preferences', { settings });
}
