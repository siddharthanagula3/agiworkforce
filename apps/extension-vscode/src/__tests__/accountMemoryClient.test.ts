import { describe, expect, it, vi } from 'vitest';
import {
  AccountMemoryHttpError,
  AccountMemoryUnauthorizedError,
  createAccountMemoryClient,
  type MemoryFetch,
} from '../memory/accountMemoryClient';

const WORKSPACES = { workspaces: [], activeWorkspaceId: null, activeOrganizationId: null };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function bearerOf(call: unknown[]): string {
  return String(((call[1] as RequestInit).headers as Record<string, string>)['Authorization']);
}

describe('account memory client on a refused request', () => {
  it('asks again with the renewed credential before it calls the session lost', async () => {
    const fetchImpl = vi
      .fn<MemoryFetch>()
      .mockResolvedValueOnce(json(401, { error: { message: 'Authentication required' } }))
      .mockResolvedValueOnce(json(200, WORKSPACES));
    const confirmRejectedToken = vi.fn();
    const client = createAccountMemoryClient({
      baseUrl: 'https://agiworkforce.example',
      getAuthToken: async () => 'old-token',
      reviewRejectedToken: async () => ({ kind: 'retry', token: 'new-token' }),
      confirmRejectedToken,
      fetchImpl,
    });

    await expect(client.readScope()).resolves.toEqual({
      organizationId: null,
      workspaceName: null,
    });

    expect(fetchImpl.mock.calls.map(bearerOf)).toEqual(['Bearer old-token', 'Bearer new-token']);
    expect(confirmRejectedToken).not.toHaveBeenCalled();
  });

  it('reports the session lost only when the renewed credential is refused too', async () => {
    const fetchImpl = vi.fn<MemoryFetch>().mockImplementation(async () => json(401, {}));
    const confirmRejectedToken = vi.fn();
    const client = createAccountMemoryClient({
      baseUrl: 'https://agiworkforce.example',
      getAuthToken: async () => 'old-token',
      reviewRejectedToken: async () => ({ kind: 'retry', token: 'new-token' }),
      confirmRejectedToken,
      fetchImpl,
    });

    await expect(client.readScope()).rejects.toBeInstanceOf(AccountMemoryUnauthorizedError);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(confirmRejectedToken).toHaveBeenCalledWith('new-token');
  });

  it('does not call the session lost when the 401 cannot be confirmed', async () => {
    const fetchImpl = vi.fn<MemoryFetch>().mockImplementation(async () => json(401, {}));
    const client = createAccountMemoryClient({
      baseUrl: 'https://agiworkforce.example',
      getAuthToken: async () => 'old-token',
      reviewRejectedToken: async () => ({ kind: 'unconfirmed' }),
      fetchImpl,
    });

    const failure = await client.readScope().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AccountMemoryHttpError);
    expect(failure).not.toBeInstanceOf(AccountMemoryUnauthorizedError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps a plain 401 as a lost session when nothing can renew the credential', async () => {
    const client = createAccountMemoryClient({
      baseUrl: 'https://agiworkforce.example',
      getAuthToken: async () => 'old-token',
      fetchImpl: async () => json(401, {}),
    });

    await expect(client.readScope()).rejects.toBeInstanceOf(AccountMemoryUnauthorizedError);
  });

  it.each([
    [
      503,
      { error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' } },
      'Service temporarily unavailable',
    ],
    [
      403,
      { error: { code: 'FORBIDDEN', message: 'This workspace is locked down.' } },
      'This workspace is locked down.',
    ],
  ])('shows a %s in the server wording and never as a lost session', async (status, body, text) => {
    const reviewRejectedToken = vi.fn();
    const client = createAccountMemoryClient({
      baseUrl: 'https://agiworkforce.example',
      getAuthToken: async () => 'old-token',
      reviewRejectedToken,
      fetchImpl: async () => json(status, body),
    });

    const failure = await client.readScope().catch((error: unknown) => error);

    expect(failure).toMatchObject({ status, message: text });
    expect(failure).not.toBeInstanceOf(AccountMemoryUnauthorizedError);
    expect(reviewRejectedToken).not.toHaveBeenCalled();
  });
});
