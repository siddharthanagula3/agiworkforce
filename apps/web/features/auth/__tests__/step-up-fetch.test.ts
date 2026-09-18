import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'session-token') }));
vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn(async () => 'csrf-token') }));

import {
  STEP_UP_TOKEN_HEADER,
  fetchWithStepUp,
  isStepUpCancelled,
  readStepUpChallenge,
  sendAuthorizedJson,
} from '../step-up-fetch';

function refusal() {
  return new Response(
    JSON.stringify({
      error: {
        code: 'STEP_UP_REQUIRED',
        message: 'Confirm it is you with a second factor before completing this action.',
        details: {
          reason: 'step_up_required',
          action: 'organization.transfer_ownership',
          consequence: 'Ownership of this workspace moves to another member.',
          freshnessSeconds: 300,
        },
      },
    }),
    { status: 403, headers: { 'content-type': 'application/json' } },
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('readStepUpChallenge', () => {
  it('reads the action and the consequence the route declared', async () => {
    const challenge = await readStepUpChallenge(refusal(), 'org-1');

    expect(challenge).toEqual({
      action: 'organization.transfer_ownership',
      consequence: 'Ownership of this workspace moves to another member.',
      freshnessSeconds: 300,
      resourceId: 'org-1',
    });
  });

  it('leaves an ordinary 403 alone', async () => {
    const forbidden = new Response(JSON.stringify({ error: { code: 'FORBIDDEN' } }), {
      status: 403,
    });

    expect(await readStepUpChallenge(forbidden)).toBeNull();
  });

  it('does not consume the body, so the caller can still read the error', async () => {
    const response = refusal();

    await readStepUpChallenge(response);

    await expect(response.json()).resolves.toMatchObject({ error: { code: 'STEP_UP_REQUIRED' } });
  });
});

describe('fetchWithStepUp', () => {
  it('replays the request once with the grant attached', async () => {
    const send = vi
      .fn<(headers: Record<string, string>) => Promise<Response>>()
      .mockResolvedValueOnce(refusal())
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const satisfy = vi.fn(async () => 'grant.signature');

    const response = await fetchWithStepUp(send, satisfy, 'org-1');

    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]?.[0]).toEqual({});
    expect(send.mock.calls[1]?.[0]).toEqual({ [STEP_UP_TOKEN_HEADER]: 'grant.signature' });
    expect(satisfy).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'organization.transfer_ownership', resourceId: 'org-1' }),
    );
  });

  it('never challenges a request the route accepted', async () => {
    const send = vi.fn(async () => new Response('{}', { status: 200 }));
    const satisfy = vi.fn(async () => 'grant.signature');

    await fetchWithStepUp(send, satisfy);

    expect(send).toHaveBeenCalledTimes(1);
    expect(satisfy).not.toHaveBeenCalled();
  });

  it('gives up rather than retrying when the challenge is dismissed', async () => {
    const send = vi.fn(async () => refusal());

    await expect(fetchWithStepUp(send, async () => null)).rejects.toSatisfy(isStepUpCancelled);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retries only once, so a stale grant cannot loop', async () => {
    const send = vi.fn(async () => refusal());
    const satisfy = vi.fn(async () => 'grant.signature');

    const response = await fetchWithStepUp(send, satisfy);

    expect(response.status).toBe(403);
    expect(send).toHaveBeenCalledTimes(2);
    expect(satisfy).toHaveBeenCalledTimes(1);
  });
});

describe('sendAuthorizedJson', () => {
  it('carries the session, the CSRF token and the step-up header together', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    await sendAuthorizedJson(
      '/api/settings/2fa',
      { method: 'DELETE' },
      { [STEP_UP_TOKEN_HEADER]: 'grant.signature' },
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/settings/2fa');
    expect((init as RequestInit).method).toBe('DELETE');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer session-token',
      'x-csrf-token': 'csrf-token',
      [STEP_UP_TOKEN_HEADER]: 'grant.signature',
    });
    expect((init as RequestInit).body).toBeUndefined();
  });

  it('refuses to send anything when the session is gone', async () => {
    const { getAuthToken } = await import('@shared/lib/get-auth-token');
    vi.mocked(getAuthToken).mockResolvedValueOnce(null);

    await expect(sendAuthorizedJson('/api/settings/2fa', { method: 'DELETE' })).rejects.toThrow(
      /not authenticated/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
