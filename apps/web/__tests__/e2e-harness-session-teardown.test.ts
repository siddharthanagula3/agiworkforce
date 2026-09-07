import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SESSION_ID = 'sess_harness_1';
const TICKET = 'ticket_abc';

const { revokeHarnessSessions, signInWithTicket } = await import('../e2e/qa-capability-harness');

interface StubPage {
  evaluate: ReturnType<typeof vi.fn>;
  goto: ReturnType<typeof vi.fn>;
  waitForLoadState: ReturnType<typeof vi.fn>;
  waitForFunction: ReturnType<typeof vi.fn>;
  waitForTimeout: ReturnType<typeof vi.fn>;
}

function stubPage(sessionId: string | null): StubPage {
  return {
    goto: vi.fn(async () => undefined),
    waitForLoadState: vi.fn(async () => undefined),
    waitForFunction: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => undefined),
    evaluate: vi.fn(async (fn: (arg?: unknown) => unknown, arg?: unknown) => {
      const source = String(fn);
      if (source.includes('signIn.create')) return undefined;
      if (arg !== undefined) return undefined;
      return sessionId ? { id: sessionId, userId: 'user-qa' } : null;
    }),
  };
}

describe('the e2e harness cleans up the sessions it creates', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env['CLERK_SECRET_KEY'] = 'sk_test_harness';
  });

  afterEach(async () => {
    await revokeHarnessSessions();
  });

  it('revokes the session it signed in, at teardown', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await signInWithTicket(stubPage(SESSION_ID) as never, TICKET);
    expect(fetchMock).not.toHaveBeenCalled();

    await revokeHarnessSessions();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`https://api.clerk.com/v1/sessions/${SESSION_ID}/revoke`);
    expect(init?.method).toBe('POST');
  });

  it('revokes each session once and nothing it did not create', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await signInWithTicket(stubPage(SESSION_ID) as never, TICKET);
    await signInWithTicket(stubPage(SESSION_ID) as never, TICKET);

    await revokeHarnessSessions();
    await revokeHarnessSessions();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('revokes nothing when no session was created', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await signInWithTicket(stubPage(null) as never, TICKET);
    await revokeHarnessSessions();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
