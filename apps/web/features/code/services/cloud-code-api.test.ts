import { describe, expect, it, vi } from 'vitest';
import { createCloudCodeApi } from './cloud-code-api';

const session = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Workspace',
  repositoryUrl: null,
  networkAccess: 'none' as const,
  state: 'ready' as const,
  workspacePath: '/home/user',
  lastError: null,
  createdAt: '2026-07-30T12:00:00.000Z',
  updatedAt: '2026-07-30T12:00:00.000Z',
  closedAt: null,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('cloudCodeApi', () => {
  it('validates the session list response', async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        availability: {
          deploymentEnabled: true,
          storageReady: true,
          planEntitled: true,
          planTier: 'pro',
          maxSessions: 5,
        },
        sessions: [session],
      }),
    );
    const api = createCloudCodeApi({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(api.list()).resolves.toMatchObject({ sessions: [session] });
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/code/sessions',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('adds CSRF protection to create, command, and close mutations', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ session, terminalEntries: [] }, 201))
      .mockResolvedValueOnce(
        json({
          session,
          terminalEntry: {
            id: '1',
            sessionId: session.id,
            command: 'pwd',
            stdout: '/home/user\n',
            stderr: '',
            exitCode: 0,
            startedAt: '2026-07-30T12:01:00.000Z',
            completedAt: '2026-07-30T12:01:00.200Z',
          },
        }),
      )
      .mockResolvedValueOnce(json({ session: { ...session, state: 'closed' } }));
    const getCsrfToken = vi.fn(async () => 'csrf-code');
    const api = createCloudCodeApi({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getCsrfToken,
    });

    await api.create({
      requestId: 'request_123456',
      title: 'Workspace',
      networkAccess: 'none',
    });
    await api.run(session.id, 'pwd');
    await api.close(session.id);

    expect(getCsrfToken).toHaveBeenCalledTimes(3);
    for (const call of fetchImpl.mock.calls) {
      expect(call[1].headers).toMatchObject({ 'x-csrf-token': 'csrf-code' });
    }
  });

  it('reaches the agent-turn endpoint with CSRF and an idempotency key', async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        turnId: '22222222-2222-4222-8222-222222222222',
        stopReason: 'awaiting_approval',
        stepsUsed: 1,
        finalMessage: '',
        pendingApproval: {
          stepIndex: 0,
          toolUseId: 'tool-1',
          command: 'pnpm install',
          reason: 'Writes to the workspace.',
        },
      }),
    );
    const api = createCloudCodeApi({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getCsrfToken: vi.fn(async () => 'csrf-code'),
    });

    await expect(
      api.startAgentTurn(session.id, {
        goal: 'install deps',
        model: 'test-fixture-model',
        idempotencyKey: 'idem-12345678',
      }),
    ).resolves.toMatchObject({ stopReason: 'awaiting_approval' });

    const [path, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe(`/api/code/sessions/${session.id}/agent`);
    expect(init.headers).toMatchObject({
      'x-csrf-token': 'csrf-code',
      'idempotency-key': 'idem-12345678',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      goal: 'install deps',
      model: 'test-fixture-model',
    });
  });

  it('reaches the commit endpoint with CSRF and the commit message', async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        session,
        push: { ok: true, output: 'pushed to origin/main', exitCode: 0 },
      }),
    );
    const api = createCloudCodeApi({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getCsrfToken: vi.fn(async () => 'csrf-code'),
    });

    await expect(api.commit(session.id, 'wire the settings toggle')).resolves.toMatchObject({
      push: { ok: true, exitCode: 0 },
    });

    const [path, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe(`/api/code/sessions/${session.id}/commit`);
    expect(init.headers).toMatchObject({ 'x-csrf-token': 'csrf-code' });
    expect(JSON.parse(String(init.body))).toEqual({ message: 'wire the settings toggle' });
  });

  it('lists and decides agent approvals on the approvals endpoint', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          approvals: [
            {
              turnId: '22222222-2222-4222-8222-222222222222',
              stepIndex: 0,
              command: 'pnpm install',
              reason: 'Writes to the workspace.',
              goal: 'install deps',
              expiresAt: '2026-07-30T12:30:00.000Z',
              createdAt: '2026-07-30T12:00:00.000Z',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        json({
          turnId: '22222222-2222-4222-8222-222222222222',
          stopReason: 'done',
          stepsUsed: 2,
          finalMessage: 'Done.',
        }),
      );
    const api = createCloudCodeApi({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getCsrfToken: vi.fn(async () => 'csrf-code'),
    });

    await expect(api.listApprovals(session.id)).resolves.toMatchObject([{ stepIndex: 0 }]);
    await expect(
      api.decideApproval(session.id, {
        turnId: '22222222-2222-4222-8222-222222222222',
        stepIndex: 0,
        decision: 'approve',
      }),
    ).resolves.toMatchObject({ stopReason: 'done' });

    const [listPath] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const [decidePath, decideInit] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(listPath).toBe(`/api/code/sessions/${session.id}/agent/approvals`);
    expect(decidePath).toBe(`/api/code/sessions/${session.id}/agent/approvals`);
    expect(decideInit.method).toBe('POST');
    expect(JSON.parse(String(decideInit.body))).toEqual({
      turnId: '22222222-2222-4222-8222-222222222222',
      stepIndex: 0,
      decision: 'approve',
    });
  });

  it('surfaces the standardized server error message', async () => {
    const api = createCloudCodeApi({
      fetchImpl: vi.fn(async () =>
        json({ error: { code: 'FORBIDDEN', message: 'Upgrade required.' } }, 403),
      ) as unknown as typeof fetch,
      getCsrfToken: vi.fn(async () => 'csrf-code'),
    });

    await expect(
      api.create({
        requestId: 'request_123456',
        title: 'Workspace',
        networkAccess: 'none',
      }),
    ).rejects.toMatchObject({ message: 'Upgrade required.', status: 403, code: 'FORBIDDEN' });
  });

  it('drops the rate limiter own wording so a 429 is machine-shaped for the status ladder', async () => {
    const fetchImpl = vi.fn(async () =>
      json(
        { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please wait.' } },
        429,
      ),
    );
    const api = createCloudCodeApi({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(api.list()).rejects.toMatchObject({ message: 'HTTP 429', status: 429 });
  });
});

describe('cloudCodeApi session lifecycle', () => {
  function apiWith(body: unknown, status = 200) {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => json(body, status));
    return {
      fetchImpl,
      api: createCloudCodeApi({
        fetchImpl: fetchImpl as unknown as typeof fetch,
        getCsrfToken: async () => 'csrf-code',
      }),
    };
  }

  it('closes through the close route, not through DELETE', async () => {
    const { api, fetchImpl } = apiWith({ session: { ...session, state: 'closed' } });
    await api.close(session.id);
    expect(fetchImpl).toHaveBeenCalledWith(
      `/api/code/sessions/${session.id}/close`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('renames through PATCH with the new title', async () => {
    const { api, fetchImpl } = apiWith({ session: { ...session, title: 'Renamed' } });
    await expect(api.rename(session.id, 'Renamed')).resolves.toMatchObject({ title: 'Renamed' });
    expect(fetchImpl).toHaveBeenCalledWith(
      `/api/code/sessions/${session.id}`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ title: 'Renamed' }) }),
    );
  });

  it('archives and unarchives through the same PATCH', async () => {
    const { api, fetchImpl } = apiWith({ session });
    await api.setArchived(session.id, true);
    await api.setArchived(session.id, false);
    expect(fetchImpl.mock.calls.map((call) => call[1]?.body)).toEqual([
      JSON.stringify({ archived: true }),
      JSON.stringify({ archived: false }),
    ]);
  });

  it('deletes through DELETE and accepts only an honest confirmation', async () => {
    const { api, fetchImpl } = apiWith({ deleted: true });
    await expect(api.deleteSession(session.id)).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledWith(
      `/api/code/sessions/${session.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    );

    const refused = apiWith({ deleted: false });
    await expect(refused.api.deleteSession(session.id)).rejects.toThrow(/invalid response/i);
  });

  it('asks for one status of sessions when the filter is not all', async () => {
    const listBody = {
      availability: {
        deploymentEnabled: true,
        storageReady: true,
        planEntitled: true,
        planTier: 'pro',
        maxSessions: 5,
      },
      sessions: [],
    };
    const { api, fetchImpl } = apiWith(listBody);
    await api.list('archived');
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/code/sessions?status=archived',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('stops a turn through the cancel route', async () => {
    const { api, fetchImpl } = apiWith({
      turnId: '22222222-2222-4222-8222-222222222222',
      requestedAt: '2026-09-07T20:00:00Z',
    });
    await api.cancelAgentTurn(session.id);
    expect(fetchImpl).toHaveBeenCalledWith(
      `/api/code/sessions/${session.id}/agent/cancel`,
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
