import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn().mockResolvedValue('csrf-1') }));
vi.mock('@shared/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { useToolPermissionsStore } from '../tool-permissions-store';
import { queryClient } from '@shared/stores/query-client';

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  useToolPermissionsStore.setState({ permissions: {} });
  fetchMock.mockReset();
  queryClient.clear();
});

describe('tool-permissions-store server sync', () => {
  it('sets locally (sync) and persists to the server via PUT with the wire level', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    useToolPermissionsStore.getState().setToolPermission('github', 'create_issue', 'deny');
    expect(useToolPermissionsStore.getState().getToolPermission('github', 'create_issue')).toBe(
      'deny',
    );
    await flush();
    const put = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'PUT');
    expect(put).toBeTruthy();
    expect(JSON.parse((put![1] as RequestInit).body as string)).toMatchObject({
      connectorId: 'github',
      toolName: 'create_issue',
      level: 'deny',
    });
  });

  it('hydrateFromServer fills gaps and the server wins on conflict', async () => {
    useToolPermissionsStore.setState({ permissions: { github: { create_issue: 'allow' } } });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        permissions: [
          { connectorId: 'github', toolName: 'create_issue', level: 'ask' }, // conflict → server wins
          { connectorId: 'slack', toolName: 'post', level: 'ask' }, // gap → server fills
        ],
      }),
    });
    await useToolPermissionsStore.getState().hydrateFromServer();
    expect(useToolPermissionsStore.getState().getToolPermission('github', 'create_issue')).toBe(
      'ask',
    );
    expect(useToolPermissionsStore.getState().getToolPermission('slack', 'post')).toBe('ask');
  });

  it('a stale local allow does not survive a server downgrade to ask', async () => {
    useToolPermissionsStore.setState({ permissions: { notion: { search: 'allow' } } });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        permissions: [{ connectorId: 'notion', toolName: 'search', level: 'ask' }],
      }),
    });
    await useToolPermissionsStore.getState().hydrateFromServer();
    expect(useToolPermissionsStore.getState().getToolPermission('notion', 'search')).toBe('ask');
  });

  it('hydrateFromServer is a no-op that keeps local state on a non-ok response', async () => {
    useToolPermissionsStore.setState({ permissions: { github: { x: 'deny' } } });
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await useToolPermissionsStore.getState().hydrateFromServer();
    expect(useToolPermissionsStore.getState().getToolPermission('github', 'x')).toBe('deny');
  });

  it('two consumers hydrating within the cache window issue one request', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        permissions: [{ connectorId: 'github', toolName: 'create_issue', level: 'allow' }],
      }),
    });
    await Promise.all([
      useToolPermissionsStore.getState().hydrateFromServer(),
      useToolPermissionsStore.getState().hydrateFromServer(),
    ]);
    await useToolPermissionsStore.getState().hydrateFromServer();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a permission write invalidates the cache so the next hydrate refetches', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        permissions: [{ connectorId: 'github', toolName: 'create_issue', level: 'allow' }],
      }),
    });
    await useToolPermissionsStore.getState().hydrateFromServer();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    useToolPermissionsStore.getState().setToolPermission('slack', 'post', 'deny');
    await flush();

    await useToolPermissionsStore.getState().hydrateFromServer();
    const getCalls = fetchMock.mock.calls.filter((c) => !(c[1] as RequestInit)?.method);
    expect(getCalls.length).toBe(2);
  });
});

/**
 * The reset used to clear only the local map while the server kept enforcing
 * the old verdict, so an `allow` grant survived a reset and reappeared on the
 * next hydrate. These pin the revocation, not just the clear.
 */
describe('reset revokes on the server, not just locally', () => {
  it('calls DELETE for the connector so enforcement stops', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ success: true }) }));
    vi.stubGlobal('fetch', fetchMock);

    useToolPermissionsStore.setState({ permissions: { github: { create_issue: 'allow' } } });
    useToolPermissionsStore.getState().resetConnectorPermissions('github');

    // Clearing falls back to the safe default rather than to "no opinion".
    expect(useToolPermissionsStore.getState().getToolPermission('github', 'create_issue')).toBe(
      'ask',
    );
    await vi.waitFor(() => {
      const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit | undefined]>;
      const deleteCall = calls.find(([, init]) => init?.method === 'DELETE');
      expect(deleteCall).toBeDefined();
      expect(String(deleteCall?.[0])).toContain('connectorId=github');
    });
    vi.unstubAllGlobals();
  });

  it('still clears locally when the server call fails, and does not throw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    useToolPermissionsStore.setState({ permissions: { notion: { search: 'deny' } } });
    expect(() =>
      useToolPermissionsStore.getState().resetConnectorPermissions('notion'),
    ).not.toThrow();
    expect(useToolPermissionsStore.getState().getToolPermission('notion', 'search')).toBe('ask');
    vi.unstubAllGlobals();
  });
});
