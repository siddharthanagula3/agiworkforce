import { API_URL } from '@/lib/constants';

/**
 * The server returns a durable video as a workspace-relative, auth-gated path
 * (`/api/files/<uuid>`). Handed to the OS browser it opened nothing at all —
 * the external-URL allowlist refuses a relative URL — and made absolute it
 * would still 401, because the system browser carries no session. Resolving it
 * here lets the caller open it in the in-app browser, which does.
 */
const DURABLE_GENERATED_VIDEO_PATH =
  /^\/api\/files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveGeneratedVideoUri(candidate: string): string | null {
  const path = candidate.trim();
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (!DURABLE_GENERATED_VIDEO_PATH.test(path)) return null;
  return `${API_URL.replace(/\/+$/, '')}${path}`;
}
