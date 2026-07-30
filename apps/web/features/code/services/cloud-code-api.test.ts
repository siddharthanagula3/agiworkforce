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
});
