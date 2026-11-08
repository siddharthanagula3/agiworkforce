import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';
import { createRequestAuthority } from '@/lib/identity/request-authority';
import { getCsrfToken } from '@/lib/client/csrf';
import {
  useCreateDeveloperProject,
  useUpdateDeveloperProject,
  useArchiveDeveloperProject,
  ProjectMutationRejectedError,
  type ProjectMutationScope,
} from '../hooks/use-developer-projects';

vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn(async () => 'csrf') }));
const project = {
  id: 'project-a',
  name: 'Project',
  monthlyCreditLimit: null,
  archivedAt: null,
  createdAt: '2026-11-06T00:00:00.000Z',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const operations = [
  {
    name: 'create',
    method: 'POST',
    path: '/api/developers/projects',
    invalidations: 1,
    useRun() {
      const mutation = useCreateDeveloperProject();
      return (scope: ProjectMutationScope) =>
        mutation.mutateAsync({ scope, draft: { name: project.name, monthlyCreditLimit: null } });
    },
  },
  {
    name: 'update',
    method: 'PATCH',
    path: `/api/developers/projects/${project.id}`,
    invalidations: 1,
    useRun() {
      const mutation = useUpdateDeveloperProject();
      return (scope: ProjectMutationScope) =>
        mutation.mutateAsync({ scope, projectId: project.id, patch: { name: project.name } });
    },
  },
  {
    name: 'archive',
    method: 'DELETE',
    path: `/api/developers/projects/${project.id}`,
    invalidations: 2,
    useRun() {
      const mutation = useArchiveDeveloperProject();
      return (scope: ProjectMutationScope) =>
        mutation.mutateAsync({ scope, projectId: project.id });
    },
  },
];
const fetchMock = vi.fn<typeof fetch>();
let client: QueryClient;
let current: boolean;
const getToken = vi.fn<() => Promise<string | null>>();
let request: ReturnType<typeof createRequestAuthority>;
const dispatched = vi.fn<() => void>();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(() => {
  current = true;
  getToken.mockReset().mockResolvedValue('captured-token');
  dispatched.mockReset();
  request = createRequestAuthority(
    { userId: 'owner-a', sessionId: 'session-a', isCurrent: () => current, getToken },
    () => current,
    dispatched,
  );
  client = new QueryClient({ defaultOptions: { mutations: { retry: 1, retryDelay: 0 } } });
  vi.mocked(getCsrfToken).mockReset().mockResolvedValue('csrf');
  fetchMock.mockReset().mockResolvedValue(json({ project }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  request.retire();
  client.clear();
  vi.unstubAllGlobals();
});

describe.each(operations)('project $name captured transport', (operation) => {
  function mount(organizationId: string | null = null) {
    const view = renderHook(operation.useRun, { wrapper });
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    const scope = { request, organizationId };
    return { ...view, invalidate, scope };
  }

  it.each([null, '0190a000-0000-4000-8000-0000000000e1'])(
    'sends captured credentials and explicit scope %s',
    async (organizationId) => {
      const { result, invalidate, scope } = mount(organizationId);
      await act(async () => {
        await expect(result.current(scope)).resolves.toEqual(project);
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(operation.path);
      expect(init).toMatchObject({ method: operation.method, credentials: 'omit' });
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer captured-token');
      expect(headers.get('x-csrf-token')).toBe('csrf');
      expect(headers.get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(
        organizationId ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
      );
      expect(dispatched).toHaveBeenCalledOnce();
      expect(invalidate).toHaveBeenCalledTimes(operation.invalidations);
    },
  );

  it('refuses already retired authority before CSRF or token acquisition', async () => {
    const { result, invalidate, scope } = mount();
    request.retire();
    await act(async () => {
      await expect(result.current(scope)).rejects.toMatchObject({ name: 'AbortError' });
    });
    expect(getCsrfToken).not.toHaveBeenCalled();
    expect(getToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it.each(['csrf', 'token'] as const)(
    'does not dispatch after retirement during deferred %s',
    async (stage) => {
      const pause = deferred<string>();
      if (stage === 'csrf') vi.mocked(getCsrfToken).mockReturnValue(pause.promise);
      else getToken.mockReturnValue(pause.promise);
      const { result, invalidate, scope } = mount();
      let pending!: Promise<unknown>;
      await act(async () => {
        pending = result.current(scope);
        await Promise.resolve();
      });
      await waitFor(() =>
        expect(stage === 'csrf' ? getCsrfToken : getToken).toHaveBeenCalledOnce(),
      );
      current = false;
      await act(async () => {
        pause.resolve('retired-value');
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(dispatched).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
    },
  );

  it.each(['response', 'success-body', 'error-body'] as const)(
    'refuses a retired deferred %s without cache effects',
    async (stage) => {
      const response = deferred<Response>();
      const body = deferred<unknown>();
      const parsing = deferred<void>();
      fetchMock.mockReturnValue(
        stage === 'response'
          ? response.promise
          : Promise.resolve({
              ok: stage !== 'error-body',
              status: stage === 'error-body' ? 409 : 200,
              json: () => {
                parsing.resolve();
                return body.promise;
              },
            } as Response),
      );
      const { result, invalidate, scope } = mount();
      let pending!: Promise<unknown>;
      await act(async () => {
        pending = result.current(scope);
        await Promise.resolve();
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      if (stage !== 'response') await parsing.promise;
      current = false;
      await act(async () => {
        response.resolve(json({ project }));
        body.resolve(
          stage === 'error-body' ? { error: 'That name is already in use.' } : { project },
        );
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      });
      expect(dispatched).toHaveBeenCalledOnce();
      expect(invalidate).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it('distinguishes a current 4xx refusal without retrying', async () => {
    fetchMock.mockResolvedValue(json({ error: 'That name is already in use.' }, 409));
    const { result, invalidate, scope } = mount();
    await act(async () => {
      await expect(result.current(scope)).rejects.toBeInstanceOf(ProjectMutationRejectedError);
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('does not accept a missing project receipt or automatically replay it', async () => {
    fetchMock.mockResolvedValue(json({}));
    const { result, invalidate, scope } = mount();
    await act(async () => {
      await expect(result.current(scope)).rejects.toThrow('receipt could not be confirmed');
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(invalidate).not.toHaveBeenCalled();
  });

  if (operation.name !== 'create') {
    it('requires the receipt to identify the requested project', async () => {
      fetchMock.mockResolvedValue(json({ project: { ...project, id: 'another-project' } }));
      const { result, invalidate, scope } = mount();
      await act(async () => {
        await expect(result.current(scope)).rejects.toThrow('receipt could not be confirmed');
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(invalidate).not.toHaveBeenCalled();
    });
  }
});
