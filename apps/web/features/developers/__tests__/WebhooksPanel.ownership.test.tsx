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
  sdk: {
    loaded: true,
    user: { id: 'a' },
    session: {
      id: 'session-a',
      user: { id: 'a' },
      getToken: async (): Promise<string> => 'token-a',
    },
  },
  confirmations: [] as Confirmation[],
  closes: [] as Array<(open: boolean) => void>,
  buttons: new Map<string, Array<() => void>>(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@clerk/nextjs', () => ({ useAuth: () => fixture.auth, useClerk: () => fixture.sdk }));
vi.mock('sonner', () => ({ toast: { success: fixture.success, error: fixture.error } }));
vi.mock('@/lib/client/csrf', async (original) => ({
  ...(await original<ImportedModule0>()),
  getCsrfToken: vi.fn(async () => 'csrf'),
}));
vi.mock('@agiworkforce/ui', async (original) => {
  const actual = await original<ImportedModule1>();
  return {
    ...actual,
    Button: (props: React.ComponentProps<typeof actual.Button>) => {
      if (typeof props.children === 'string' && props.onClick) {
        const callbacks = fixture.buttons.get(props.children) ?? [];
        callbacks.push(() => props.onClick?.({} as React.MouseEvent<HTMLButtonElement>));
        fixture.buttons.set(props.children, callbacks);
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
import { DEVELOPER_WEBHOOK_EVENTS } from '@/lib/developer-api/webhook-events';
import { WebhooksPanel } from '../components/WebhooksPanel';

const endpoint = {
  id: 'endpoint-a',
  url: 'https://example.com/events',
  description: 'Production',
  eventTypes: [DEVELOPER_WEBHOOK_EVENTS[0]!.type],
  secretPrefix: 'whsec',
  enabled: true,
  createdAt: '2026-10-20T00:00:00.000Z',
};
const delivery = {
  id: 'delivery-a',
  eventId: 'event-a',
  eventType: endpoint.eventTypes[0],
  status: 'delivered',
  attempts: 1,
  responseStatus: 200,
  error: null,
  redeliveryOf: null,
  lastAttemptAt: endpoint.createdAt,
  deliveredAt: endpoint.createdAt,
  createdAt: endpoint.createdAt,
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
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
let client: QueryClient;
let listedEndpoints = [endpoint];
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const read = (path: RequestInfo | URL) =>
  String(path) === MANAGED_CLOUD_WORKSPACES_PATH
    ? json(personal)
    : String(path).endsWith('/deliveries')
      ? json({ deliveries: [delivery] })
      : json({ endpoints: listedEndpoints });
const latestButton = (name: string) => fixture.buttons.get(name)!.at(-1)!;
const latestClose = () => fixture.closes.at(-1)!;
const latestConfirmation = () => fixture.confirmations.at(-1)!;
async function openEditor() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add endpoint' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Add endpoint' }));
  fireEvent.change(screen.getByLabelText('Endpoint URL'), {
    target: { value: 'https://new.example.com/events' },
  });
  fireEvent.click(screen.getAllByRole('checkbox')[0]!);
}
const submitEditor = () =>
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add endpoint' }));
function changeIdentity(userId: string, sessionId: string) {
  fixture.auth = { isLoaded: true, isSignedIn: true, userId, sessionId };
  fixture.sdk.user = { id: userId };
  fixture.sdk.session = {
    id: sessionId,
    user: { id: userId },
    getToken: async () => `token-${userId}`,
  };
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
  listedEndpoints = [endpoint];
  changeIdentity('a', 'session-a');
  fixture.confirmations = [];
  fixture.closes = [];
  fixture.buttons.clear();
  fixture.success.mockReset();
  fixture.error.mockReset();
  fetchMock.mockReset().mockImplementation(async (path, init) => {
    if (init?.method === 'DELETE') return json({ deleted: true });
    if (init?.method === 'PATCH') return json({ endpoint });
    if (init?.method === 'POST')
      return String(path).endsWith('/webhooks')
        ? json({ endpoint, secret: 'once-only-secret' })
        : String(path).endsWith('/redeliver')
          ? json({ delivery: { ...delivery, id: 'redelivery-b', redeliveryOf: delivery.id } })
          : json({ delivery });
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

describe('webhook intent ownership', () => {
  it('uses captured canonical admission and prevents duplicate creation in StrictMode', async () => {
    render(
      <StrictMode>
        <WebhooksPanel />
      </StrictMode>,
      { wrapper },
    );
    await openEditor();
    const form = screen.getByLabelText('Endpoint URL').closest('form')!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    await screen.findByText('once-only-secret');
    expect(writes()).toHaveLength(1);
    const init = writes()[0]![1]!;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-a');
    expect(new Headers(init.headers).get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(
      MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
    );
    expect(new Headers(init.headers).get('x-csrf-token')).toBe('csrf');
    expect(init.credentials).toBe('omit');
    expect(JSON.parse(String(init.body)).eventTypes).toEqual(endpoint.eventTypes);
  });

  it('starts a fresh create form on batched close and reopen and ignores its stale close', async () => {
    render(<WebhooksPanel />, { wrapper });
    await openEditor();
    const close = latestClose();
    const reopen = latestButton('Add endpoint');
    act(() => {
      close(false);
      reopen();
    });
    expect(screen.getByLabelText('Endpoint URL')).toHaveValue('');
    expect(screen.getAllByRole('checkbox')[0]).not.toBeChecked();
    act(() => close(false));
    expect(screen.getByLabelText('Endpoint URL')).toHaveValue('');
    expect(writes()).toHaveLength(0);
  });

  it('retires editor and removal callbacks across A/B/A', async () => {
    const mounted = render(<WebhooksPanel />, { wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    const old = latestConfirmation();
    act(() => changeIdentity('b', 'session-b'));
    mounted.rerender(<WebhooksPanel />);
    await screen.findByText('Production');
    act(() => changeIdentity('a', 'session-a'));
    mounted.rerender(<WebhooksPanel />);
    await openEditor();
    await act(async () => {
      old.onCancel?.();
      await old.onConfirm();
    });
    expect(screen.getByLabelText('Endpoint URL')).toHaveValue('https://new.example.com/events');
    expect(writes()).toHaveLength(0);
  });

  it('retires copied fields and confirmation at workspace epoch changes', async () => {
    render(<WebhooksPanel />, { wrapper });
    await openEditor();
    act(changeEpoch);
    expect(screen.queryByLabelText('Endpoint URL')).toBeNull();
    expect(writes()).toHaveLength(0);
  });

  it.each(['csrf', 'token'] as const)(
    'cancels before dispatch while %s is deferred',
    async (gate) => {
      render(<WebhooksPanel />, { wrapper });
      await openEditor();
      const pending = deferred<string>();
      const token = vi.fn(() => pending.promise);
      if (gate === 'csrf') vi.mocked(getCsrfToken).mockReturnValueOnce(pending.promise);
      else fixture.sdk.session.getToken = token;
      submitEditor();
      await waitFor(() =>
        expect(gate === 'csrf' ? vi.mocked(getCsrfToken) : token).toHaveBeenCalled(),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await act(async () => pending.resolve(gate));
      expect(writes()).toHaveLength(0);
      expect(screen.queryByText('once-only-secret')).toBeNull();
      expect(screen.queryByText(/could not confirm whether/)).toBeNull();
    },
  );

  it('suppresses late secret bodies after cancellation and reports uncertainty without replay', async () => {
    const body = deferred<unknown>();
    const readBody = vi.fn(() => body.promise);
    fetchMock.mockImplementation(async (path, init) =>
      init?.method === 'POST' ? Object.assign(new Response(null), { json: readBody }) : read(path),
    );
    render(<WebhooksPanel />, { wrapper });
    await openEditor();
    submitEditor();
    await waitFor(() => expect(readBody).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText(/could not confirm whether/)).toBeInTheDocument();
    const readsBefore = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh webhook state' }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(readsBefore));
    await act(async () => body.resolve({ endpoint, secret: 'retired-secret' }));
    expect(screen.queryByText('retired-secret')).toBeNull();
    expect(writes()).toHaveLength(1);
    expect(fixture.success).not.toHaveBeenCalled();
  });

  it('does not wait for endpoint refetch to show a validated signing secret', async () => {
    const refresh = deferred<Response>();
    let wrote = false;
    fetchMock.mockImplementation(async (path, init) => {
      if (init?.method === 'POST') {
        wrote = true;
        return json({ endpoint, secret: 'immediate-secret' });
      }
      if (wrote && String(path).endsWith('/webhooks')) return refresh.promise;
      return read(path);
    });
    render(<WebhooksPanel />, { wrapper });
    await openEditor();
    submitEditor();
    await screen.findByText('immediate-secret');
    fireEvent.click(screen.getByRole('button', { name: 'I have stored it' }));
    expect(screen.queryByText('immediate-secret')).toBeNull();
    await waitFor(() =>
      expect(
        client
          .getMutationCache()
          .getAll()
          .some((mutation) => (mutation.state.data as { secret?: string } | undefined)?.secret),
      ).toBe(false),
    );
    await act(async () => refresh.resolve(json({ endpoints: [endpoint] })));
  });

  it('guards stale secret close/copy and clipboard completion against a replacement secret', async () => {
    const copied = deferred<void>();
    const writeText = vi.fn(() => copied.promise);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<WebhooksPanel />, { wrapper });
    await openEditor();
    submitEditor();
    await screen.findByText('once-only-secret');
    const oldCopy = latestButton('Copy secret');
    const oldDismiss = latestButton('I have stored it');
    act(oldCopy);
    expect(writeText).toHaveBeenCalledWith('once-only-secret');
    act(oldDismiss);
    await openEditor();
    submitEditor();
    await screen.findByText('once-only-secret');
    await act(async () => {
      oldDismiss();
      oldCopy();
      copied.resolve();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Copy secret' })).toBeInTheDocument();
    expect(screen.getByText('once-only-secret')).toBeInTheDocument();
  });

  it('removes visible secret and prevents stale clipboard dispatch at owner change', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const mounted = render(<WebhooksPanel />, { wrapper });
    await openEditor();
    submitEditor();
    await screen.findByText('once-only-secret');
    const copy = latestButton('Copy secret');
    act(() => changeIdentity('b', 'session-b'));
    mounted.rerender(<WebhooksPanel />);
    await screen.findByText('Production');
    act(copy);
    expect(screen.queryByText('once-only-secret')).toBeNull();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('blocks callbacks from removed rows and hidden delivery logs', async () => {
    render(<WebhooksPanel />, { wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Deliveries' }));
    await screen.findByRole('button', { name: 'Resend' });
    const resend = latestButton('Resend');
    const test = latestButton('Send test event');
    const toggle = latestButton('Turn off');
    const edit = latestButton('Edit');
    const remove = latestButton('Remove');
    fireEvent.click(screen.getByRole('button', { name: 'Hide deliveries' }));
    act(resend);
    listedEndpoints = [];
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['developers', 'webhooks'] });
    });
    await screen.findByText(/No endpoints yet/);
    act(() => {
      test();
      toggle();
      edit();
      remove();
      resend();
    });
    expect(writes()).toHaveLength(0);
    expect(fixture.confirmations).toHaveLength(0);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('retires a resend blocked in CSRF as soon as deliveries hide', async () => {
    render(<WebhooksPanel />, { wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Deliveries' }));
    const pending = deferred<string>();
    vi.mocked(getCsrfToken).mockReturnValueOnce(pending.promise);
    fireEvent.click(await screen.findByRole('button', { name: 'Resend' }));
    await waitFor(() => expect(getCsrfToken).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Hide deliveries' }));
    await act(async () => pending.resolve('csrf'));
    expect(writes()).toHaveLength(0);
    expect(fixture.success).not.toHaveBeenCalled();
  });

  it.each(['Send test event', 'Turn off', 'Resend'])(
    'guards duplicate %s dispatch and does not retry uncertain writes',
    async (name) => {
      const pending = deferred<Response>();
      fetchMock.mockImplementation(async (path, init) =>
        ['POST', 'PATCH'].includes(init?.method ?? '') ? pending.promise : read(path),
      );
      render(<WebhooksPanel />, { wrapper });
      await screen.findByRole('button', { name: 'Send test event' });
      if (name === 'Resend') fireEvent.click(screen.getByRole('button', { name: 'Deliveries' }));
      const button = await screen.findByRole('button', { name });
      act(() => {
        button.click();
        button.click();
      });
      await waitFor(() => expect(writes()).toHaveLength(1));
      await act(async () => pending.resolve(json({ error: 'unavailable' }, 503)));
      await screen.findByText(/could not confirm whether/);
      expect(writes()).toHaveLength(1);
      expect(fixture.success).not.toHaveBeenCalled();
    },
  );

  it('allows a deliberate corrected editor retry after a 4xx refusal', async () => {
    let attempts = 0;
    fetchMock.mockImplementation(async (path, init) =>
      init?.method === 'POST'
        ? ++attempts === 1
          ? json({ error: 'Rejected URL' }, 400)
          : json({ endpoint, secret: 'corrected-secret' })
        : read(path),
    );
    render(<WebhooksPanel />, { wrapper });
    await openEditor();
    submitEditor();
    await screen.findByRole('alert');
    expect(writes()).toHaveLength(1);
    expect(screen.getByLabelText('Endpoint URL')).toHaveValue('https://new.example.com/events');
    fireEvent.change(screen.getByLabelText('Endpoint URL'), {
      target: { value: 'https://corrected.example.com/events' },
    });
    submitEditor();
    await screen.findByText('corrected-secret');
    expect(writes()).toHaveLength(2);
  });

  it('cancels a removal confirmation without granting a stale callback a new intent', async () => {
    render(<WebhooksPanel />, { wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    const stale = latestConfirmation();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await act(async () => {
      stale.onCancel?.();
      await stale.onConfirm();
    });
    expect(writes()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Remove endpoint' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(String(writes()[0]![0])).toContain('/endpoint-a');
  });

  it('starts a fresh edit intent on batched cancel and reopen without stale closure authority', async () => {
    render(<WebhooksPanel />, { wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Endpoint URL'), {
      target: { value: 'https://abandoned.example.com' },
    });
    const oldClose = latestClose();
    const reopen = latestButton('Edit');
    act(() => {
      oldClose(false);
      reopen();
    });
    expect(screen.getByLabelText('Endpoint URL')).toHaveValue(endpoint.url);
    act(() => oldClose(false));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(JSON.parse(String(writes()[0]![1]!.body)).url).toBe(endpoint.url);
    expect(writes()[0]![1]!.method).toBe('PATCH');
  });

  it('retires pending secret parsing across an A/B/A round trip', async () => {
    const pending = deferred<unknown>();
    const readBody = vi.fn(() => pending.promise);
    fetchMock.mockImplementation(async (path, init) =>
      init?.method === 'POST' ? Object.assign(new Response(null), { json: readBody }) : read(path),
    );
    const mounted = render(<WebhooksPanel />, { wrapper });
    await openEditor();
    submitEditor();
    await waitFor(() => expect(readBody).toHaveBeenCalled());
    act(() => changeIdentity('b', 'session-b'));
    mounted.rerender(<WebhooksPanel />);
    await screen.findByText('Production');
    act(() => changeIdentity('a', 'session-a'));
    mounted.rerender(<WebhooksPanel />);
    await openEditor();
    await act(async () => pending.resolve({ endpoint, secret: 'old-owner-secret' }));
    expect(screen.queryByText('old-owner-secret')).toBeNull();
    expect(screen.getByLabelText('Endpoint URL')).toHaveValue('https://new.example.com/events');
    expect(writes()).toHaveLength(1);
  });

  it('cannot confirm removal after an epoch round trip', async () => {
    render(<WebhooksPanel />, { wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    const stale = latestConfirmation();
    await act(async () => {
      changeEpoch();
      await stale.onConfirm();
    });
    expect(writes()).toHaveLength(0);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('gives a reopened delivery log a new lifetime even when hide and reopen are batched', async () => {
    render(<WebhooksPanel />, { wrapper });
    const open = await screen.findByRole('button', { name: 'Deliveries' });
    const reopen = latestButton('Deliveries');
    fireEvent.click(open);
    await screen.findByRole('button', { name: 'Resend' });
    const oldResend = latestButton('Resend');
    const hide = latestButton('Hide deliveries');
    act(() => {
      hide();
      reopen();
    });
    await screen.findByRole('button', { name: 'Resend' });
    act(oldResend);
    expect(writes()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Resend' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
  });

  it('refreshes active deliveries as well as endpoints after an uncertain resend without replay', async () => {
    fetchMock.mockImplementation(async (path, init) =>
      init?.method === 'POST' ? json({ error: 'unknown' }, 503) : read(path),
    );
    render(<WebhooksPanel />, { wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Deliveries' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Resend' }));
    await screen.findByText(/could not confirm whether/);
    const countReads = (suffix: string) =>
      fetchMock.mock.calls.filter(
        ([path, init]) => init?.method === 'GET' && String(path).endsWith(suffix),
      ).length;
    const endpointReads = countReads('/webhooks');
    const deliveryReads = countReads('/deliveries');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh webhook state' }));
    await waitFor(() => {
      expect(countReads('/webhooks')).toBeGreaterThan(endpointReads);
      expect(countReads('/deliveries')).toBeGreaterThan(deliveryReads);
    });
    expect(writes()).toHaveLength(1);
    expect(screen.getByText(/could not confirm whether/)).toBeInTheDocument();
  });

  it('shows honest current clipboard failure and success states', async () => {
    const writeText = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValueOnce(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<WebhooksPanel />, { wrapper });
    await openEditor();
    submitEditor();
    fireEvent.click(await screen.findByRole('button', { name: 'Copy secret' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy failed' }));
    await screen.findByRole('button', { name: 'Copied' });
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it('opens current deliveries after a successful test event', async () => {
    render(<WebhooksPanel />, { wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Send test event' }));
    await screen.findByRole('button', { name: 'Hide deliveries' });
    await screen.findByRole('button', { name: 'Resend' });
    expect(writes()).toHaveLength(1);
    expect(fixture.success).toHaveBeenCalledWith('A test event is on its way.');
  });
});

type ImportedModule0 = typeof import('@/lib/client/csrf');
type ImportedModule1 = typeof import('@agiworkforce/ui');
