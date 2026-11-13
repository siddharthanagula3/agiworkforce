import { API_URL } from '@/lib/constants';

export function uploadDestinationHeaders(
  uploadUrl: URL,
  uploadHeaders: Record<string, string>,
  authHeaders: Record<string, string>,
): Record<string, string> {
  return uploadUrl.origin === new URL(API_URL).origin
    ? { ...uploadHeaders, ...authHeaders }
    : uploadHeaders;
}
