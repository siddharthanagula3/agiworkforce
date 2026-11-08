import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_WORKSPACES_PATH,
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';

type Confirmation = { onConfirm: () => unknown; onCancel?: () => void };
const fixture = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: 'a', sessionId: 'session-a' },
  sdk: {
    loaded: true,
    user: { id: 'a' },
    session: { id: 'session-a', user: { id: 'a' }, getToken: async () => 'token-a' },
  },
  confirmations: [] as Confirmation[],
  closes: [] as Array<(open: boolean) => void>,
  newProject: [] as Array<() => void>,
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@clerk/nextjs', () => ({ useAuth: () => fixture.auth, useClerk: () => fixture.sdk }));
vi.mock('sonner', () => ({ toast: { success: fixture.success, error: fixture.error } }));
vi.mock('@/lib/client/csrf', async (original) => ({
  ...(await original<ImportedModule0>()),
  getCsrfToken: vi.fn(async () => 'csrf'),
}));
vi.mock('@features/settings/hooks/use-settings-queries', () => ({
  useAPIKeys: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock('../hooks/use-developer-usage', () => ({
  useDeveloperUsage: () => ({ data: { projects: [] }, isLoading: false, isError: false }),
}));
vi.mock('@agiworkforce/ui', async (original) => {
  const actual = await original<ImportedModule1>();
  return {
    ...actual,
    Button: (props: React.ComponentProps<typeof actual.Button>) => {
      if (props.children === 'New project' && props.onClick) {
        fixture.newProject.push(() => props.onClick?.({} as React.MouseEvent<HTMLButtonElement>));
      }
      return <actual.Button {...props} />;
    },
    Dialog: (props: React.ComponentProps<typeof actual.Dialog>) => {
      if (props.onOpenChange) fixture.closes.push(props.onOpenChange);
      return <actual.Dialog {...props} />;
    },
    useConfirmAction: () => {
      const result = actual.useConfirmAction();
      return {
        ...result,
        confirm: (request: Parameters<typeof result.confirm>[0]) => {
          fixture.confirmations.push(request);
          result.confirm(request);
        },
      };
    },
  };
});

import { getCsrfToken } from '@/lib/client/csrf';
import {
  beginWorkspaceSwitch,
  finishWorkspaceSwitch,
  observeWorkspaceOwner,
} from '@/features/workspaces/lib/workspace-admission';
import { ProjectsPanel } from '../components/ProjectsPanel';

const project = {
  id: 'p',
  name: 'Production',
  archivedAt: null,
  monthlyCreditLimit: null,
  createdAt: '2026-10-20T00:00:00.000Z',
};
const personal = {
  scope: 'personal',
  activeWorkspaceId: 'personal',
  activeOrganizationId: null,
  workspaces: [],
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const fetchMock = vi.fn<typeof fetch>();
const writes = () =>
  fetchMock.mock.calls.filter(([, init]) =>
    ['POST', 'PATCH', 'DELETE'].includes(init?.method ?? ''),
  );
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const read = (path: RequestInfo | URL) =>
  String(path) === MANAGED_CLOUD_WORKSPACES_PATH ? json(personal) : json({ projects: [project] });
const latestConfirmation = () => fixture.confirmations[fixture.confirmations.length - 1]!;
const latestClose = () => fixture.closes[fixture.closes.length - 1]!;
async function openEditor() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'New project' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'New project' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Copied draft' } });
}
async function openArchive() {
  fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
  return latestConfirmation();
}
function changeIdentity(userId: string, sessionId: string) {
  fixture.auth = { isLoaded: true, isSignedIn: true, userId, sessionId };
  fixture.sdk.user = { id: userId };
  fixture.sdk.session = {
    id: sessionId,
    user: { id: userId },
    getToken: async () => `token-${userId}`,
  };
}
beforeEach(() => {
  observeWorkspaceOwner(null);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  changeIdentity('a', 'session-a');
  fixture.confirmations = [];
  fixture.closes = [];
  fixture.newProject = [];
  fixture.success.mockReset();
  fixture.error.mockReset();
  fetchMock
    .mockReset()
    .mockImplementation(async (path, init) =>
      init?.method === 'POST' || init?.method === 'PATCH' || init?.method === 'DELETE'
        ? json({ project })
        : read(path),
    );
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(getCsrfToken).mockReset().mockResolvedValue('csrf');
});
afterEach(() => {
  cleanup();
  client.clear();
  observeWorkspaceOwner(null);
  vi.unstubAllGlobals();
});

describe('project intent ownership', () => {
  it('captures the workspace and request at open and permits one write in StrictMode', async () => {
    render(
      <StrictMode>
        <ProjectsPanel />
      </StrictMode>,
      { wrapper },
    );
    await openEditor();
    const submit = screen.getByRole('button', { name: 'Create project' });
    act(() => {
      submit.click();
      submit.click();
    });
    await waitFor(() => expect(writes()).toHaveLength(1));
    await waitFor(() => expect(screen.queryByLabelText('Name')).toBeNull());
    const init = writes()[0]![1]!;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-a');
    expect(new Headers(init.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(
      MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
    );
    expect(new Headers(init.headers).get('x-csrf-token')).toBe('csrf');
    expect(init.credentials).toBe('omit');
  });

  it('starts a fresh create form when close and reopen are batched before unmount', async () => {
    render(<ProjectsPanel />, { wrapper });
    await openEditor();
    const oldClose = latestClose();
    const reopen = fixture.newProject[fixture.newProject.length - 1]!;
    act(() => {
      oldClose(false);
      reopen();
    });
    expect(screen.getByLabelText('Name')).toHaveValue('');
    act(() => oldClose(false));
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(writes()).toHaveLength(0);
  });

  it('removes copied editor data across an A/B/A identity round trip', async () => {
    const mounted = render(<ProjectsPanel />, { wrapper });
    await openEditor();
    const oldClose = latestClose();
    act(() => changeIdentity('b', 'session-b'));
    mounted.rerender(<ProjectsPanel />);
    await screen.findByText('Production');
    act(() => changeIdentity('a', 'session-a'));
    mounted.rerender(<ProjectsPanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'New project' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    expect(screen.getByLabelText('Name')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Copied draft' } });
    act(() => oldClose(false));
    expect(screen.getByLabelText('Name')).toHaveValue('Copied draft');
    expect(writes()).toHaveLength(0);
  });

  it('retires confirmation on a workspace epoch round trip before a stale confirm can run', async () => {
    render(<ProjectsPanel />, { wrapper });
    const old = await openArchive();
    const owner = observeWorkspaceOwner({
      userId: 'a',
      sessionId: 'session-a',
      isCurrent: () => true,
      getToken: async () => 'unused',
    })!;
    await act(async () => {
      const epoch = beginWorkspaceSwitch(owner, owner.epoch);
      finishWorkspaceSwitch(owner, epoch, false);
      await old.onConfirm();
    });
    expect(writes()).toHaveLength(0);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(fixture.success).not.toHaveBeenCalled();
  });

  it('retires copied editor fields when the workspace epoch changes', async () => {
    render(<ProjectsPanel />, { wrapper });
    await openEditor();
    const owner = observeWorkspaceOwner({
      userId: 'a',
      sessionId: 'session-a',
      isCurrent: () => true,
      getToken: async () => 'unused',
    })!;
    act(() => {
      const epoch = beginWorkspaceSwitch(owner, owner.epoch);
      finishWorkspaceSwitch(owner, epoch, false);
    });
    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(writes()).toHaveLength(0);
  });

  it('suppresses a late archive receipt and stale confirmation across A/B/A', async () => {
    const body = deferred<unknown>();
    const readBody = vi.fn(() => body.promise);
    fetchMock.mockImplementation(async (path, init) =>
      init?.method === 'DELETE'
        ? Object.assign(new Response(null), { json: readBody })
        : read(path),
    );
    const mounted = render(<ProjectsPanel />, { wrapper });
    const old = await openArchive();
    fireEvent.click(screen.getByRole('button', { name: 'Archive project' }));
    await waitFor(() => expect(readBody).toHaveBeenCalled());
    act(() => changeIdentity('b', 'session-b'));
    mounted.rerender(<ProjectsPanel />);
    await screen.findByText('Production');
    act(() => changeIdentity('a', 'session-a'));
    mounted.rerender(<ProjectsPanel />);
    await openEditor();
    await act(async () => {
      body.resolve({ project });
      await old.onConfirm();
    });
    expect(screen.getByLabelText('Name')).toHaveValue('Copied draft');
    expect(fixture.success).not.toHaveBeenCalled();
    expect(fixture.error).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(1);
  });

  it('does not let a cancelled archive confirmation affect its replacement', async () => {
    render(<ProjectsPanel />, { wrapper });
    const old = await openArchive();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const fresh = await openArchive();
    await act(async () => {
      old.onCancel?.();
      await old.onConfirm();
    });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
    await act(async () => {
      await fresh.onConfirm();
    });
    expect(writes()).toHaveLength(1);
    expect(fixture.success).toHaveBeenCalledOnce();
  });

  it.each(['token', 'csrf'])(
    'retires a submission awaiting %s when its editor closes',
    async (stage) => {
      render(<ProjectsPanel />, { wrapper });
      await openEditor();
      const token = deferred<string>();
      const csrf = deferred<string>();
      const tokenRead = vi.fn(() => token.promise);
      if (stage === 'token') fixture.sdk.session.getToken = tokenRead;
      else vi.mocked(getCsrfToken).mockReturnValueOnce(csrf.promise);
      fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
      await waitFor(() =>
        expect(stage === 'token' ? tokenRead : vi.mocked(getCsrfToken)).toHaveBeenCalled(),
      );
      act(() => latestClose()(false));
      await act(async () => {
        token.resolve('token-a');
        csrf.resolve('csrf');
      });
      expect(writes()).toHaveLength(0);
      expect(screen.queryByText(/could not confirm whether/)).toBeNull();
    },
  );

  it('rejects a same-account SDK session replacement during CSRF acquisition', async () => {
    render(<ProjectsPanel />, { wrapper });
    await openEditor();
    const csrf = deferred<string>();
    vi.mocked(getCsrfToken).mockReturnValueOnce(csrf.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(vi.mocked(getCsrfToken)).toHaveBeenCalled());
    fixture.sdk.session = { ...fixture.sdk.session };
    await act(async () => csrf.resolve('csrf'));
    expect(writes()).toHaveLength(0);
    expect(fixture.error).not.toHaveBeenCalled();
  });

  it('a late body cannot close a reopened editor or replace its notice', async () => {
    const body = deferred<unknown>();
    const readBody = vi.fn(() => body.promise);
    fetchMock.mockImplementation(async (path, init) =>
      init?.method === 'POST' ? Object.assign(new Response(null), { json: readBody }) : read(path),
    );
    render(<ProjectsPanel />, { wrapper });
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(readBody).toHaveBeenCalled());
    const close = latestClose();
    act(() => close(false));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Check the project state before repeating',
    );
    await openEditor();
    await act(async () => {
      body.resolve({ project });
      close(false);
    });
    expect(screen.getByLabelText('Name')).toHaveValue('Copied draft');
    expect(screen.queryByText(/could not confirm whether/)).toBeNull();
    expect(fixture.success).not.toHaveBeenCalled();
    expect(fixture.error).not.toHaveBeenCalled();
  });

  it('refreshes the owned project list on explicit choice without replaying an uncertain write', async () => {
    fetchMock.mockImplementation(async (path, init) => {
      if (init?.method === 'POST') throw new Error('network lost');
      return read(path);
    });
    render(<ProjectsPanel />, { wrapper });
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await screen.findByText(/could not confirm whether/);
    const projectReads = () =>
      fetchMock.mock.calls.filter(
        ([path, init]) => String(path) === '/api/developers/projects' && init?.method === 'GET',
      );
    const before = projectReads().length;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh projects' }));
    await waitFor(() => expect(projectReads()).toHaveLength(before + 1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Refresh projects' })).toBeEnabled(),
    );
    expect(writes()).toHaveLength(1);
    expect(screen.getByText(/could not confirm whether/)).toBeInTheDocument();
    expect(fixture.success).not.toHaveBeenCalled();
  });

  it('offers a corrected retry after a definite refusal, but no automatic retry on uncertainty', async () => {
    let attempts = 0;
    fetchMock.mockImplementation(async (path, init) => {
      if (init?.method !== 'POST') return read(path);
      attempts += 1;
      if (attempts === 1) return json({ error: 'Name is unavailable' }, 400);
      throw new Error('network lost');
    });
    render(<ProjectsPanel />, { wrapper });
    await openEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Name')).toHaveValue('Copied draft');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Corrected' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await screen.findByText(/could not confirm whether/);
    expect(writes()).toHaveLength(2);
    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(fixture.error).not.toHaveBeenCalled();
  });
});

type ImportedModule0 = typeof import('@/lib/client/csrf');
type ImportedModule1 = typeof import('@agiworkforce/ui');
