export const SESSION_EXPIRED_PATH = '/session-expired';
const RETURN_PARAM = 'redirectTo';

export function sessionExpiredRedirect(requestedPath: string): string {
  return `${SESSION_EXPIRED_PATH}?${RETURN_PARAM}=${encodeURIComponent(requestedPath)}`;
}
