'use client';

export interface SessionAuthority {
  readonly userId: string;
  readonly sessionId: string;
  isCurrent: () => boolean;
  getToken: (options?: { skipCache?: boolean }) => Promise<string | null>;
  subscribe?: (listener: () => void) => () => void;
}

export interface RequestAuthority {
  readonly session: SessionAuthority;
  readonly signal: AbortSignal;
  isCurrent: () => boolean;
  assertCurrent: () => void;
  getToken: () => Promise<string>;
  fetch: typeof fetch;
  retire: () => void;
}

export function createRequestAuthority(
  session: SessionAuthority,
  isOwner: () => boolean = () => true,
  onDispatch?: () => void,
): RequestAuthority {
  const controller = new AbortController();
  const retire = () => controller.abort();
  const isCurrent = () => {
    if (!controller.signal.aborted && (!isOwner() || !session.isCurrent())) retire();
    return !controller.signal.aborted;
  };
  const assertCurrent = () => {
    if (!isCurrent()) throw new DOMException('Request owner changed', 'AbortError');
  };
  return {
    session,
    signal: controller.signal,
    isCurrent,
    assertCurrent,
    retire,
    getToken: async () => {
      assertCurrent();
      const token = await session.getToken();
      assertCurrent();
      if (!token) throw new Error('Not authenticated');
      return token;
    },
    fetch: async (input, init) => {
      assertCurrent();
      const destination = input instanceof Request ? input.url : String(input);
      const origin = typeof window === 'undefined' ? null : window.location.origin;
      const target = new URL(destination, origin ?? 'https://request-authority.invalid');
      if (
        !target.pathname.startsWith('/api/') ||
        target.origin !== (origin ?? 'https://request-authority.invalid')
      ) {
        throw new Error('Request authority requires a same-origin API destination');
      }
      const token = await session.getToken();
      assertCurrent();
      if (!token) throw new Error('Not authenticated');
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      headers.set('Authorization', `Bearer ${token}`);
      const inputSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      const requestInit: RequestInit = {
        ...init,
        headers,
        credentials: 'omit',
        signal: inputSignal ? AbortSignal.any([controller.signal, inputSignal]) : controller.signal,
      };
      assertCurrent();
      onDispatch?.();
      const response = await fetch(input, requestInit);
      if (!isCurrent()) {
        void response.body?.cancel().catch(() => undefined);
        assertCurrent();
      }
      return response;
    },
  };
}
