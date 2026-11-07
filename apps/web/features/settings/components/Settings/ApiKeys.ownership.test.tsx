import React, { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  listeners: new Set<() => void>(),
  sdk: {
    loaded: true,
    user: { id: 'a' },
    session: {
      id: 'session-a',
      user: { id: 'a' },
      getToken: async (): Promise<string> => 'token-a',
    },
    addListener:
      (_listener: () => void): (() => void) =>
      () =>
        undefined,
  },
  confirmations: [] as Confirmation[],
  closes: [] as Array<(open: boolean) => void>,
  buttons: new Map<string, Array<() => void>>(),
  success: vi.fn(),
  error: vi.fn(),
  validate: null as Promise<void> | null,
}));
vi.mock('@clerk/nextjs', async (original) => ({
  ...(await original<typeof import('@clerk/nextjs')>()),
  useAuth: () => fixture.auth,
  useClerk: () => fixture.sdk,
  useSession: () => ({ isLoaded: true, session: fixture.sdk.session }),
}));
vi.mock('sonner', () => ({ toast: { success: fixture.success, error: fixture.error } }));
vi.mock('@/lib/client/csrf', async (original) => ({
  ...(await original<typeof import('@/lib/client/csrf')>()),
  getCsrfToken: vi.fn(async () => 'csrf'),
}));
vi.mock('@hookform/resolvers/zod', async (original) => {
  const actual = await original<typeof import('@hookform/resolvers/zod')>();
  return {
    ...actual,
    zodResolver: (...args: Parameters<typeof actual.zodResolver>) => {
      const resolve = actual.zodResolver(...args);
      return async (...values: Parameters<typeof resolve>) => {
        if (fixture.validate) await fixture.validate;
        return resolve(...values);
      };
    },
  };
});
vi.mock('@/features/developers/hooks/use-developer-projects', async (original) => ({
  ...(await original<typeof import('@/features/developers/hooks/use-developer-projects')>()),
  useDeveloperProjects: () => ({ data: [], isLoading: false, isSuccess: true, isError: false }),
}));
vi.mock('@/features/developers/hooks/use-developer-usage', () => ({
  useDeveloperUsage: () => ({
    data: { keys: [], projects: [] },
    isLoading: false,
    isSuccess: true,
    isError: false,
  }),
}));
vi.mock('@agiworkforce/ui', async (original) => {
  const actual = await original<typeof import('@agiworkforce/ui')>();
  return {
    ...actual,
    Button: (props: React.ComponentProps<typeof actual.Button>) => {
      const label = React.Children.toArray(props.children)
        .filter((child) => typeof child === 'string')
        .join('')
        .trim();
      if (label && props.onClick) {
        const callbacks = fixture.buttons.get(label) ?? [];
        callbacks.push(() => props.onClick?.({} as React.MouseEvent<HTMLButtonElement>));
        fixture.buttons.set(label, callbacks);
      }
      return <actual.Button {...props} />;
    },
    AlertDialog: (props: React.ComponentProps<typeof actual.AlertDialog>) => {
      if (props.onOpenChange) fixture.closes.push(props.onOpenChange);
      return <actual.AlertDialog {...props} />;
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
import { ApiKeysManager } from './ApiKeys';

const key = {
  id: 'key-a',
  name: 'Production',
  key_prefix: 'prefix',
  scopes: ['inference:write'],
  created_at: '2026-10-20T00:00:00.000Z',
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
  fetchMock.mock.calls.filter(
    ([path, init]) =>
      String(path).includes('/settings/api-keys') &&
      ['POST', 'DELETE'].includes(init?.method ?? ''),
  );
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const read = (path: RequestInfo | URL) =>
  String(path) === MANAGED_CLOUD_WORKSPACES_PATH ? json(personal) : json({ api_keys: [key] });
const receipt = () => json({ api_key: key, full_key: 'once-only-secret' });
const latestButton = (name: string) => fixture.buttons.get(name)!.at(-1)!;
const latestClose = () => fixture.closes.at(-1)!;
const latestConfirmation = () => fixture.confirmations.at(-1)!;
async function openEditor() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'New Key' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'New Key' }));
  fireEvent.change(screen.getByPlaceholderText('e.g., Production API'), {
    target: { value: 'Copied draft' },
  });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate Key' })).toBeEnabled());
}
const submit = () =>
  fireEvent.submit(screen.getByPlaceholderText('e.g., Production API').closest('form')!);
async function openDelete() {
  fireEvent.click(await screen.findByRole('button', { name: 'Delete Production' }));
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
  for (const listener of fixture.listeners) listener();
}
function changeEpoch() {
  const owner = observeWorkspaceOwner({
    userId: 'a',
    sessionId: 'session-a',
    isCurrent: () => true,
    getToken: async () => 'unused',
  })!;
  const epoch = beginWorkspaceSwitch(owner, owner.epoch);
  finishWorkspaceSwitch(owner, epoch, false);
}
beforeEach(() => {
  observeWorkspaceOwner(null);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: 3 } },
  });
  fixture.listeners.clear();
  fixture.sdk.addListener = (listener) => {
    fixture.listeners.add(listener);
    listener();
    return () => {
      fixture.listeners.delete(listener);
    };
  };
  changeIdentity('a', 'session-a');
  fixture.confirmations = [];
  fixture.closes = [];
  fixture.buttons.clear();
  fixture.validate = null;
  fixture.success.mockReset();
  fixture.error.mockReset();
  fetchMock.mockReset().mockImplementation(async (path, init) => {
    if (init?.method === 'DELETE') return json({ message: 'Deleted' });
    if (init?.method === 'POST') return receipt();
    return read(path);
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(getCsrfToken).mockReset().mockResolvedValue('csrf');
});
afterEach(() => {
  cleanup();
  client.clear();
  observeWorkspaceOwner(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

describe('API key editor ownership', () => {
  it('admits one create with captured workspace headers under StrictMode and synchronous subscriptions', async () => {
    render(
      <StrictMode>
        <ApiKeysManager />
      </StrictMode>,
      { wrapper },
    );
    await openEditor();
    act(() => {
      submit();
      submit();
    });
    await screen.findByText('once-only-secret');
    expect(writes()).toHaveLength(1);
    const init = writes()[0]![1]!;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-a');
    expect(new Headers(init.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(
      MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
    );
    expect(init.credentials).toBe('omit');
    expect(JSON.parse(String(init.body))).toMatchObject({
      name: 'Copied draft',
      scopes: ['models:read', 'inference:write'],
    });
  });

  it('resets batched close/reopen forms and ignores stale cancel and deferred validation', async () => {
    render(<ApiKeysManager />, { wrapper });
    await openEditor();
    const validation = deferred<void>();
    fixture.validate = validation.promise;
    submit();
    const oldCancel = latestButton('Cancel');
    const reopen = latestButton('New Key');
    act(() => {
      oldCancel();
      reopen();
    });
    const input = screen.getByPlaceholderText('e.g., Production API');
    expect(input).toHaveValue('');
    fireEvent.change(input, { target: { value: 'Replacement' } });
    await act(async () => {
      oldCancel();
      validation.resolve();
    });
    expect(input).toHaveValue('Replacement');
    expect(writes()).toHaveLength(0);
  });

  it.each(['csrf', 'token', 'body'] as const)(
    'retires a create while %s is deferred across A/B/A',
    async (boundary) => {
      const pending = deferred<string>();
      const body = deferred<unknown>();
      const readBody = vi.fn(() => body.promise);
      const mounted = render(<ApiKeysManager />, { wrapper });
      await openEditor();
      if (boundary === 'csrf') vi.mocked(getCsrfToken).mockReturnValueOnce(pending.promise);
      if (boundary === 'token') fixture.sdk.session.getToken = vi.fn(() => pending.promise);
      if (boundary === 'body')
        fetchMock.mockImplementation(async (path, init) =>
          init?.method === 'POST'
            ? ({ ok: true, status: 200, json: readBody } as unknown as Response)
            : read(path),
        );
      submit();
      await waitFor(() =>
        boundary === 'body'
          ? expect(readBody).toHaveBeenCalled()
          : boundary === 'csrf'
            ? expect(getCsrfToken).toHaveBeenCalled()
            : expect(fixture.sdk.session.getToken).toHaveBeenCalled(),
      );
      act(() => changeIdentity('b', 'session-b'));
      mounted.rerender(<ApiKeysManager />);
      await screen.findByText('Production');
      act(() => changeIdentity('a', 'session-a'));
      mounted.rerender(<ApiKeysManager />);
      await openEditor();
      await act(async () => {
        pending.resolve('late');
        body.resolve({ api_key: key, full_key: 'stale-secret' });
      });
      expect(screen.queryByText('stale-secret')).toBeNull();
      expect(screen.getByPlaceholderText('e.g., Production API')).toHaveValue('Copied draft');
      expect(writes()).toHaveLength(boundary === 'body' ? 1 : 0);
      expect(fixture.success).not.toHaveBeenCalled();
      expect(fixture.error).not.toHaveBeenCalled();
    },
  );

  it('retires stale deletion confirmation at an epoch change', async () => {
    render(<ApiKeysManager />, { wrapper });
    const confirmation = await openDelete();
    await act(async () => {
      changeEpoch();
      await confirmation.onConfirm();
    });
    expect(writes()).toHaveLength(0);
  });

  it('admits one delete without auto-closing its request authority', async () => {
    const response = deferred<Response>();
    fetchMock.mockImplementation(async (path, init) =>
      init?.method === 'DELETE' ? response.promise : read(path),
    );
    render(<ApiKeysManager />, { wrapper });
    const confirmation = await openDelete();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete Key' }));
      void confirmation.onConfirm();
    });
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]![1]!.signal?.aborted).toBe(false);
    await act(async () => {
      response.resolve(json({ message: 'Deleted' }));
    });
    await waitFor(() => expect(fixture.success).toHaveBeenCalledWith('API key deleted'));
  });

  it('surfaces known deletion refusal as actionable without replay or uncertainty', async () => {
    fetchMock.mockImplementation(async (path, init) =>
      init?.method === 'DELETE'
        ? json({ error: 'This key cannot be revoked by your account.' }, 403)
        : read(path),
    );
    render(<ApiKeysManager />, { wrapper });
    await openDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Key' }));
    await screen.findByRole('alert');
    expect(screen.queryByText(/We could not confirm/)).toBeNull();
    expect(writes()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Delete Production' })).toBeEnabled();
  });

  it('cancels waiting on a dispatched deletion without claiming rollback', async () => {
    const response = deferred<Response>();
    fetchMock.mockImplementation(async (path, init) =>
      init?.method === 'DELETE' ? response.promise : read(path),
    );
    render(<ApiKeysManager />, { wrapper });
    await openDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Key' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel waiting' }));
    expect(
      screen.getByText(/We could not confirm whether this API key action completed/),
    ).toBeInTheDocument();
    expect(writes()[0]![1]!.signal?.aborted).toBe(true);
    await act(async () => {
      response.resolve(json({ message: 'Deleted' }));
    });
    expect(fixture.success).not.toHaveBeenCalled();
  });

  it('clears a receipt on dismissal and suppresses late clipboard feedback and stale copy', async () => {
    const copied = deferred<void>();
    const writeText = vi.fn(() => copied.promise);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ApiKeysManager />, { wrapper });
    await openEditor();
    submit();
    await screen.findByText('once-only-secret');
    const copy = latestButton('Copy to Clipboard');
    act(copy);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await act(async () => {
      copy();
      copied.resolve();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('once-only-secret')).toBeNull();
    expect(fixture.success).not.toHaveBeenCalled();
    await waitFor(() => expect(client.getMutationCache().getAll()).toHaveLength(0));
  });

  it('allows a fresh receipt copy while an old clipboard operation is unresolved', async () => {
    const oldCopy = deferred<void>();
    const newCopy = deferred<void>();
    const writeText = vi
      .fn()
      .mockReturnValueOnce(oldCopy.promise)
      .mockReturnValueOnce(newCopy.promise);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ApiKeysManager />, { wrapper });
    await openEditor();
    submit();
    await screen.findByText('once-only-secret');
    act(latestButton('Copy to Clipboard'));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await openEditor();
    submit();
    await screen.findByText('once-only-secret');
    const freshCopy = latestButton('Copy to Clipboard');
    act(freshCopy);
    expect(writeText).toHaveBeenCalledTimes(2);
    await act(async () => {
      oldCopy.resolve();
    });
    act(freshCopy);
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(fixture.success).not.toHaveBeenCalled();
    await act(async () => {
      newCopy.resolve();
    });
    expect(fixture.success).toHaveBeenCalledTimes(1);
  });

  it('erases a receipt immediately on native identity notification before an auth rerender', async () => {
    render(<ApiKeysManager />, { wrapper });
    await openEditor();
    submit();
    await screen.findByText('once-only-secret');
    act(() => changeIdentity('b', 'session-b'));
    expect(screen.queryByText('once-only-secret')).toBeNull();
    expect(fixture.success).not.toHaveBeenCalled();
  });

  it('reports uncertain cancellation only after the write was dispatched', async () => {
    const response = deferred<Response>();
    fetchMock.mockImplementation(async (path, init) =>
      init?.method === 'POST' ? response.promise : read(path),
    );
    render(<ApiKeysManager />, { wrapper });
    await openEditor();
    submit();
    await waitFor(() => expect(writes()).toHaveLength(1));
    act(() => latestClose()(false));
    expect(
      screen.getByText(/We could not confirm whether this API key action completed/),
    ).toBeInTheDocument();
    expect(writes()[0]![1]!.signal?.aborted).toBe(true);
    await act(async () => {
      response.resolve(receipt());
    });
    expect(screen.queryByText('once-only-secret')).toBeNull();
  });

  it('keeps uncertainty visible through a read-only refresh without replay', async () => {
    fetchMock.mockImplementation(async (path, init) =>
      init?.method === 'POST' ? json({}, 502) : read(path),
    );
    render(<ApiKeysManager />, { wrapper });
    await openEditor();
    submit();
    await screen.findByText(/We could not confirm whether this API key action completed/);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh API keys' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([, init]) => !init?.method || init.method === 'GET').length,
      ).toBeGreaterThan(2),
    );
    expect(
      screen.getByText(/We could not confirm whether this API key action completed/),
    ).toBeInTheDocument();
    expect(writes()).toHaveLength(1);
  });

  it('keeps the draft editable after a known refusal and permits one explicit retry', async () => {
    let refused = false;
    fetchMock.mockImplementation(async (path, init) => {
      if (init?.method === 'POST') {
        if (!refused) {
          refused = true;
          return json({ error: 'Choose another name' }, 400);
        }
        return receipt();
      }
      return read(path);
    });
    render(<ApiKeysManager />, { wrapper });
    await openEditor();
    submit();
    await screen.findByRole('alert');
    expect(screen.getByPlaceholderText('e.g., Production API')).toHaveValue('Copied draft');
    submit();
    await screen.findByText('once-only-secret');
    expect(writes()).toHaveLength(2);
  });

  it('shows the once-only receipt without waiting for a background key-list refresh', async () => {
    const refresh = deferred<Response>();
    let created = false;
    fetchMock.mockImplementation(async (path, init) => {
      if (init?.method === 'POST') {
        created = true;
        return receipt();
      }
      if (created && String(path).includes('/settings/api-keys')) return refresh.promise;
      return read(path);
    });
    render(<ApiKeysManager />, { wrapper });
    await openEditor();
    submit();
    await screen.findByText('once-only-secret');
    expect(writes()).toHaveLength(1);
    await act(async () => {
      refresh.resolve(read('/api/settings/api-keys'));
    });
  });

  it('replays exactly once with a silent grant and the immutable submitted draft', async () => {
    const grant = deferred<Response>();
    fetchMock.mockImplementation(async (path, init) => {
      if (String(path) === '/api/auth/step-up') return grant.promise;
      if (init?.method === 'POST') {
        if (!new Headers(init.headers).has('x-step-up-token'))
          return json(
            {
              error: {
                code: 'STEP_UP_REQUIRED',
                details: {
                  action: 'api_credential.reveal',
                  consequence: 'Create a key',
                  freshnessSeconds: 300,
                },
              },
            },
            403,
          );
        return receipt();
      }
      return read(path);
    });
    render(<ApiKeysManager />, { wrapper });
    await openEditor();
    submit();
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([path]) => String(path) === '/api/auth/step-up')).toBe(
        true,
      ),
    );
    fireEvent.change(screen.getByPlaceholderText('e.g., Production API'), {
      target: { value: 'Later edit' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Read usage/ }));
    await act(async () => {
      grant.resolve(json({ token: 'proof' }));
    });
    await screen.findByText('once-only-secret');
    expect(writes()).toHaveLength(2);
    expect(writes()[1]![1]!.body).toBe(writes()[0]![1]!.body);
    expect(new Headers(writes()[1]![1]!.headers).get('x-step-up-token')).toBe('proof');
  });

  it('does not let a stale delete confirmation cancel or execute its replacement', async () => {
    render(<ApiKeysManager />, { wrapper });
    const old = await openDelete();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const fresh = await openDelete();
    await act(async () => {
      old.onCancel?.();
      await old.onConfirm();
    });
    expect(writes()).toHaveLength(0);
    await act(async () => {
      await fresh.onConfirm();
    });
    expect(writes()).toHaveLength(1);
  });

  it('preserves the editable draft without an alarming toast when current SDK verification is cancelled', async () => {
    const startVerification = vi.fn(async () => ({
      status: 'needs_first_factor',
      supportedFirstFactors: [{ strategy: 'password' }],
    }));
    Object.assign(fixture.sdk.session, { startVerification });
    fetchMock.mockImplementation(async (path, init) => {
      if (String(path) === '/api/auth/step-up')
        return json(
          {
            error: {
              code: 'STEP_UP_VERIFICATION_REQUIRED',
              message: 'Confirm it is you.',
              details: { level: 'first_factor' },
            },
          },
          403,
        );
      if (init?.method === 'POST')
        return json(
          {
            error: {
              code: 'STEP_UP_REQUIRED',
              details: {
                action: 'api_credential.reveal',
                consequence: 'Create a key',
                freshnessSeconds: 300,
              },
            },
          },
          403,
        );
      return read(path);
    });
    render(<ApiKeysManager />, { wrapper });
    await openEditor();
    submit();
    const challenge = await screen.findByRole('dialog', { name: 'Confirm it is you' });
    await waitFor(() => expect(startVerification).toHaveBeenCalled());
    fireEvent.click(within(challenge).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Confirm it is you' })).toBeNull(),
    );
    expect(screen.getByPlaceholderText('e.g., Production API')).toHaveValue('Copied draft');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate Key' })).toBeEnabled());
    expect(screen.queryByText(/We could not confirm/)).toBeNull();
    expect(fixture.error).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(1);
  });

  it('does not report uncertainty after recognized refusal while a silent grant is pending', async () => {
    const grant = deferred<Response>();
    fetchMock.mockImplementation(async (path, init) => {
      if (String(path) === '/api/auth/step-up') return grant.promise;
      if (init?.method === 'POST')
        return json(
          {
            error: {
              code: 'STEP_UP_REQUIRED',
              details: {
                action: 'api_credential.reveal',
                consequence: 'Create a key',
                freshnessSeconds: 300,
              },
            },
          },
          403,
        );
      return read(path);
    });
    render(<ApiKeysManager />, { wrapper });
    await openEditor();
    submit();
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([path]) => String(path) === '/api/auth/step-up')).toBe(
        true,
      ),
    );
    act(() => latestClose()(false));
    await act(async () => {
      grant.resolve(json({ token: 'late-proof' }));
    });
    expect(screen.queryByText(/We could not confirm/)).toBeNull();
    expect(writes()).toHaveLength(1);
    expect(fixture.error).not.toHaveBeenCalled();
  });
});
