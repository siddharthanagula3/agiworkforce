import { API_URL } from '@/lib/constants';

const DURABLE_GENERATED_VIDEO_PATH =
  /^\/api\/files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveGeneratedVideoUri(candidate: string): string | null {
  const path = candidate.trim();
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (!DURABLE_GENERATED_VIDEO_PATH.test(path)) return null;
  return `${API_URL.replace(/\/+$/, '')}${path}`;
}
