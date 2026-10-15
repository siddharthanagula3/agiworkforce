/**
 * Where the hosted app shows one coding session on this device. The shell
 * builds this URL from a notification or tray item and the page reads it back,
 * so both sides take it from here.
 */
export const LOCAL_SESSION_ROUTE = '/code';
export const CODE_LOCAL_ROOT_PARAM = 'local';
export const CODE_LOCAL_THREAD_PARAM = 'thread';

export interface LocalSessionAddress {
  rootId: string;
  threadId: string;
}

export function localSessionPath(rootId: string, threadId: string): string {
  const query = new URLSearchParams({
    [CODE_LOCAL_ROOT_PARAM]: rootId,
    [CODE_LOCAL_THREAD_PARAM]: threadId,
  });
  return `${LOCAL_SESSION_ROUTE}?${query.toString()}`;
}

export function localSessionFromSearch(search: string): LocalSessionAddress | null {
  const params = new URLSearchParams(search);
  const rootId = params.get(CODE_LOCAL_ROOT_PARAM);
  const threadId = params.get(CODE_LOCAL_THREAD_PARAM);
  return rootId && threadId ? { rootId, threadId } : null;
}
