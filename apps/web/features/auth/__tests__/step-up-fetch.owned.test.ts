import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequestAuthority } from '@/lib/identity/request-authority';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { getCsrfToken } from '@/lib/client/csrf';
import { fetchWithStepUp, requestStepUpGrant } from '../step-up-fetch';

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn() }));
vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function scope() {
  const getToken = vi.fn(async () => 'fake-ordinary-token');
  const onDispatch = vi.fn();
  const authority = createRequestAuthority({ userId: 'a', sessionId: 'a', isCurrent: () => true, getToken }, undefined, onDispatch);
  return { authority, getToken, onDispatch };
}
function refusal() {
  return new Response(JSON.stringify({ error: { code: 'STEP_UP_REQUIRED', details: { action: 'api_credential.reveal' } } }), { status: 403 });
}
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCsrfToken).mockResolvedValue('fake-csrf');
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ token: 'fake-grant' })));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('owned step-up transport', () => {
  it('preserves the explicit fresh token and never marks grants as writes', async () => {
    const { authority, getToken, onDispatch } = scope();
    await requestStepUpGrant('organization.transfer_ownership', null, 'fake-fresh-token', authority);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/step-up', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer fake-fresh-token' }),
      signal: authority.signal,
      credentials: 'omit',
    }));
    expect(getToken).not.toHaveBeenCalled();
    expect(getAuthToken).not.toHaveBeenCalled();
    expect(onDispatch).not.toHaveBeenCalled();
  });

  it('fails closed on explicit null fresh token', async () => {
    const { authority, getToken } = scope();
    expect(await requestStepUpGrant('organization.transfer_ownership', null, null, authority)).toMatchObject({ kind: 'failed' });
    expect(getToken).not.toHaveBeenCalled();
    expect(getAuthToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not dispatch after retirement during CSRF acquisition', async () => {
    const csrf = deferred<string>();
    vi.mocked(getCsrfToken).mockReturnValueOnce(csrf.promise);
    const { authority } = scope();
    const result = requestStepUpGrant('organization.transfer_ownership', null, 'fake-fresh-token', authority);
    authority.retire();
    csrf.resolve('fake-csrf');
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('notifies only the recognized initial refusal before satisfying and replays once', async () => {
    const { authority } = scope();
    const events: string[] = [];
    const send = vi.fn(async () => { events.push('write'); return refusal(); });
    const satisfy = vi.fn(async () => { events.push('grant'); return 'fake-proof'; });
    await fetchWithStepUp(send, satisfy, null, { authority, onStepUpRequired: () => { events.push('refusal'); } });
    expect(events).toEqual(['write', 'refusal', 'grant', 'write']);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does not replay a proof returned after retirement', async () => {
    const { authority } = scope();
    const send = vi.fn(async () => refusal());
    await expect(fetchWithStepUp(send, async () => { authority.retire(); return 'fake-proof'; }, null, { authority }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(send).toHaveBeenCalledTimes(1);
  });
});


it('does not challenge a recognized refusal parsed after intent retirement', async () => {
  const body = deferred<unknown>();
  const parsingStarted = deferred<void>();
  const first = refusal();
  vi.spyOn(first, 'clone').mockReturnValue({
    json: () => {
      parsingStarted.resolve();
      return body.promise;
    },
  } as Response);
  const { authority } = scope();
  const satisfy = vi.fn(async () => 'fake-proof');
  const onStepUpRequired = vi.fn();
  const send = vi.fn(async () => first);
  const operation = fetchWithStepUp(send, satisfy, null, { authority, onStepUpRequired });
  await parsingStarted.promise;
  authority.retire();
  body.resolve({ error: { code: 'STEP_UP_REQUIRED', details: { action: 'organization.transfer_ownership' } } });
  await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
  expect(satisfy).not.toHaveBeenCalled();
  expect(onStepUpRequired).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledTimes(1);
});

it('discards a grant body completed after retirement', async () => {
  const body = deferred<unknown>();
  const parsingStarted = deferred<void>();
  const response = new Response('{}');
  vi.spyOn(response, 'json').mockImplementation(() => {
    parsingStarted.resolve();
    return body.promise;
  });
  fetchMock.mockResolvedValue(response);
  const { authority } = scope();
  const operation = requestStepUpGrant('organization.transfer_ownership', null, 'fake-fresh-token', authority);
  await parsingStarted.promise;
  authority.retire();
  body.resolve({ token: 'fake-proof' });
  await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
});
