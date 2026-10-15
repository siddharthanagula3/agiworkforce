import { describe, expect, it } from 'vitest';
import {
  CODE_LOCAL_ROOT_PARAM,
  CODE_LOCAL_THREAD_PARAM,
  LOCAL_SESSION_ROUTE,
  localSessionFromSearch,
  localSessionPath,
} from '../local-session-route';

describe('local session route', () => {
  it('reads back exactly the session it addressed, whatever the ids contain', () => {
    const path = localSessionPath('root 1&x', 'thread/2?y');

    expect(path.startsWith(`${LOCAL_SESSION_ROUTE}?`)).toBe(true);
    expect(localSessionFromSearch(path.slice(LOCAL_SESSION_ROUTE.length))).toEqual({
      rootId: 'root 1&x',
      threadId: 'thread/2?y',
    });
  });

  it('names its parameters, so the shell and the page agree on them', () => {
    expect(localSessionPath('root-1', 'thread-1')).toBe(
      `/code?${CODE_LOCAL_ROOT_PARAM}=root-1&${CODE_LOCAL_THREAD_PARAM}=thread-1`,
    );
  });

  it('addresses nothing when either id is missing', () => {
    expect(localSessionFromSearch('?local=root-1')).toBeNull();
    expect(localSessionFromSearch('?thread=thread-1')).toBeNull();
    expect(localSessionFromSearch('?local=&thread=thread-1')).toBeNull();
    expect(localSessionFromSearch('')).toBeNull();
  });
});
