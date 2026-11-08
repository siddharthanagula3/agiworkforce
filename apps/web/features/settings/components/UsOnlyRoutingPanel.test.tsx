import type { WebFetch } from '@/test/fetch';
import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { modelRegistry } from '@agiworkforce/model-registry';
import { isBillingPlanTier } from '@agiworkforce/types';

const fixture = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: 'a', sessionId: 'session-a' },
  sdk: {
    loaded: true,
    user: { id: 'a' },
    session: { id: 'session-a', user: { id: 'a' }, getToken: async () => 'token-a' },
  },
  callbacks: [] as Array<(value: boolean) => void>,
}));

vi.mock('@clerk/nextjs', () => ({ useAuth: () => fixture.auth, useClerk: () => fixture.sdk }));
vi.mock('@/lib/clerk-session', async (original) => ({
  ...(await original<MockedModule0>()),
  hasClerkSessionCookie: () => false,
  hasUsableClerkSessionToken: () => false,
  subscribeToClerkSessionChange: () => () => undefined,
}));
vi.mock('@/lib/client/csrf', async (original) => ({
  ...(await original<MockedModule1>()),
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => headers),
}));
vi.mock('@agiworkforce/ui', async (original) => ({
  ...(await original<MockedModule2>()),
  Switch: (props: {
    checked: boolean;
    disabled: boolean;
    onCheckedChange: (value: boolean) => void;
    'aria-label': string;
  }) => {
    fixture.callbacks.push(props.onCheckedChange);
    return (
      <button
        role="switch"
        aria-label={props['aria-label']}
        aria-checked={props.checked}
        disabled={props.disabled}
        onClick={() => props.onCheckedChange(!props.checked)}
      />
    );
  },
}));

import { useBillingStore } from '@shared/stores/web-auth-store';
import { observePreferenceOwner } from '@/app/settings/_lib/preferences-client';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { UsOnlyRoutingPanel } from './UsOnlyRoutingPanel';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
const fetchMock = vi.fn<WebFetch>();
const control = () => screen.getByRole('switch');
const retained = () => fixture.callbacks[fixture.callbacks.length - 1]!;
const puts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');

beforeEach(() => {
  observePreferenceOwner(null);
  fixture.callbacks = [];
  fixture.auth = { isLoaded: true, isSignedIn: true, userId: 'a', sessionId: 'session-a' };
  fixture.sdk.loaded = true;
  fixture.sdk.user = { id: 'a' };
  fixture.sdk.session = { id: 'session-a', user: { id: 'a' }, getToken: async () => 'token-a' };
  const tier =
    modelRegistry.policies.auto.providerPolicies.usOnly.allowedTiers.find(isBillingPlanTier);
  if (!tier) throw new Error('Registry has no eligible billing tier');
  useBillingStore.setState({
    isLoading: false,
    subscription: {
      tier,
      status: 'active',
      display_name: tier,
      plan_name: tier,
      current_period_end: null,
    },
  });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(addCsrfHeaders)
    .mockReset()
    .mockImplementation(async (headers) => new Headers(headers));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('US-only routing preference ownership', () => {
  it('owns one write, preserves geo overlay and uses captured bearer authority', async () => {
    const pending = deferred<Response>();
    fetchMock
      .mockResolvedValueOnce(json({ us_only: false, geo_overlay: 'in' }))
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(json({ us_only: true, geo_overlay: 'in' }));
    render(<UsOnlyRoutingPanel />);
    await waitFor(() => expect(control()).toBeEnabled());
    const save = retained();
    act(() => {
      save(true);
      save(true);
    });
    await waitFor(() => expect(puts()).toHaveLength(1));
    const init = puts()[0]![1]!;
    expect(JSON.parse(String(init.body))).toEqual({ us_only: true, geo_overlay: 'in' });
    expect(init.credentials).toBe('omit');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-a');
    await act(async () => pending.resolve(json({ us_only: true, geo_overlay: 'in' })));
    await waitFor(() => expect(control()).toBeEnabled());
    expect(control()).toHaveAttribute('aria-checked', 'true');
    act(() => save(false));
    expect(puts()).toHaveLength(1);
  });

  it('rejects a retained callback after unmount', async () => {
    fetchMock.mockResolvedValueOnce(json({}));
    const mounted = render(<UsOnlyRoutingPanel />);
    await waitFor(() => expect(control()).toBeEnabled());
    const save = retained();
    mounted.unmount();
    act(() => save(true));
    expect(puts()).toHaveLength(0);
  });

  it('retires an eligibility round trip synchronously before React commits', async () => {
    fetchMock.mockImplementation(async () => json({}));
    render(<UsOnlyRoutingPanel />);
    await waitFor(() => expect(control()).toBeEnabled());
    const save = retained();
    const subscription = useBillingStore.getState().subscription!;
    act(() => {
      useBillingStore.setState({ subscription: { ...subscription, status: 'canceled' } });
      useBillingStore.setState({ subscription });
      save(true);
    });
    expect(puts()).toHaveLength(0);
    await waitFor(() => expect(control()).toBeEnabled());
    act(() => save(true));
    expect(puts()).toHaveLength(0);
  });

  it('does not treat an unrelated billing update as another preference owner', async () => {
    fetchMock.mockResolvedValueOnce(json({}));
    render(<UsOnlyRoutingPanel />);
    await waitFor(() => expect(control()).toBeEnabled());
    act(() => useBillingStore.setState({ isLoading: true }));
    expect(control()).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects same-account SDK session replacement before a React render', async () => {
    fetchMock.mockResolvedValueOnce(json({}));
    render(<UsOnlyRoutingPanel />);
    await waitFor(() => expect(control()).toBeEnabled());
    const save = retained();
    fixture.sdk.session = { ...fixture.sdk.session };
    act(() => save(true));
    expect(puts()).toHaveLength(0);
  });

  it('refuses dispatch after identity changes during CSRF acquisition', async () => {
    const csrf = deferred<Headers>();
    fetchMock.mockResolvedValueOnce(json({}));
    vi.mocked(addCsrfHeaders).mockReturnValueOnce(csrf.promise);
    render(<UsOnlyRoutingPanel />);
    await waitFor(() => expect(control()).toBeEnabled());
    act(() => retained()(true));
    fixture.sdk.user = { id: 'b' };
    fixture.sdk.session = { id: 'session-b', user: { id: 'b' }, getToken: async () => 'token-b' };
    await act(async () => csrf.resolve(new Headers()));
    expect(puts()).toHaveLength(0);
  });

  it('does not publish an old read into a replacement account', async () => {
    const old = deferred<Response>();
    fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(json({ us_only: false }));
    const mounted = render(<UsOnlyRoutingPanel />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fixture.auth = { ...fixture.auth, userId: 'b', sessionId: 'session-b' };
    fixture.sdk.user = { id: 'b' };
    fixture.sdk.session = { id: 'session-b', user: { id: 'b' }, getToken: async () => 'token-b' };
    mounted.rerender(<UsOnlyRoutingPanel />);
    await waitFor(() => expect(control()).toBeEnabled());
    await act(async () => old.resolve(json({ us_only: true })));
    expect(control()).toHaveAttribute('aria-checked', 'false');
  });

  it('discards a delayed read body after the view is replaced', async () => {
    const body = deferred<unknown>();
    const response = json({});
    const parse = vi.spyOn(response, 'json').mockReturnValue(body.promise);
    fetchMock.mockResolvedValueOnce(response).mockResolvedValueOnce(json({ us_only: false }));
    const old = render(<UsOnlyRoutingPanel />);
    await waitFor(() => expect(parse).toHaveBeenCalledOnce());
    const stale = retained();
    old.unmount();
    render(<UsOnlyRoutingPanel />);
    await waitFor(() => expect(control()).toBeEnabled());
    await act(async () => body.resolve({ us_only: true }));
    act(() => stale(true));
    expect(control()).toHaveAttribute('aria-checked', 'false');
    expect(puts()).toHaveLength(0);
  });

  it('discards a delayed receipt after closing and reopening the view', async () => {
    const body = deferred<unknown>();
    const response = json({});
    const parse = vi.spyOn(response, 'json').mockReturnValue(body.promise);
    fetchMock
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(json({ us_only: false }));
    const old = render(<UsOnlyRoutingPanel />);
    await waitFor(() => expect(control()).toBeEnabled());
    const stale = retained();
    act(() => stale(true));
    await waitFor(() => expect(parse).toHaveBeenCalledOnce());
    old.unmount();
    render(<UsOnlyRoutingPanel />);
    await waitFor(() => expect(control()).toBeEnabled());
    await act(async () => body.resolve({ us_only: true }));
    act(() => stale(true));
    expect(control()).toHaveAttribute('aria-checked', 'false');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.queryByText(/was saved as on/)).toBeNull();
    expect(puts()).toHaveLength(1);
  });

  it('does not let old settlement release a replacement loading operation', async () => {
    const oldBody = deferred<unknown>();
    const newRead = deferred<Response>();
    const response = json({});
    const parse = vi.spyOn(response, 'json').mockReturnValue(oldBody.promise);
    fetchMock.mockResolvedValueOnce(response).mockReturnValueOnce(newRead.promise);
    const mounted = render(<UsOnlyRoutingPanel />);
    await waitFor(() => expect(parse).toHaveBeenCalledOnce());
    const subscription = useBillingStore.getState().subscription!;
    act(() => {
      useBillingStore.setState({ subscription: { ...subscription, status: 'canceled' } });
      useBillingStore.setState({ subscription });
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => oldBody.resolve({ us_only: true }));
    expect(control()).toBeDisabled();
    expect(screen.getByText('Updating your latest setting…')).toBeVisible();
    act(() => retained()(true));
    expect(puts()).toHaveLength(0);
    await act(async () => newRead.resolve(json({ us_only: false })));
    await waitFor(() => expect(control()).toBeEnabled());
    expect(control()).toHaveAttribute('aria-checked', 'false');
    mounted.unmount();
  });

  it('refuses a pending write after eligibility changes away and back during CSRF', async () => {
    const csrf = deferred<Headers>();
    fetchMock.mockImplementation(async () => json({}));
    vi.mocked(addCsrfHeaders).mockReturnValueOnce(csrf.promise);
    render(<UsOnlyRoutingPanel />);
    await waitFor(() => expect(control()).toBeEnabled());
    act(() => retained()(true));
    const subscription = useBillingStore.getState().subscription!;
    act(() => {
      useBillingStore.setState({ subscription: { ...subscription, status: 'canceled' } });
      useBillingStore.setState({ subscription });
    });
    await act(async () => csrf.resolve(new Headers()));
    await waitFor(() => expect(control()).toBeEnabled());
    expect(puts()).toHaveLength(0);
  });

  it.each([
    { body: null },
    { body: [] },
    { body: { us_only: 'true' } },
    { body: { geo_overlay: 'invalid' } },
  ])('refuses malformed read $body and offers only a read retry', async ({ body }) => {
    fetchMock.mockResolvedValueOnce(json(body)).mockResolvedValueOnce(json({}));
    render(<UsOnlyRoutingPanel />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Retry loading' })).toBeVisible(),
    );
    expect(control()).toBeDisabled();
    act(() => retained()(true));
    expect(puts()).toHaveLength(0);
    act(() => screen.getByRole('button', { name: 'Retry loading' }).click());
    await waitFor(() => expect(control()).toBeEnabled());
    expect(puts()).toHaveLength(0);
  });

  it.each([{}, { us_only: false }, { us_only: 'true' }])(
    'does not acknowledge a missing, mismatched or malformed receipt %j',
    async (receipt) => {
      fetchMock
        .mockResolvedValueOnce(json({ us_only: false }))
        .mockResolvedValueOnce(json(receipt))
        .mockResolvedValueOnce(json({ us_only: true }));
      render(<UsOnlyRoutingPanel />);
      await waitFor(() => expect(control()).toBeEnabled());
      act(() => retained()(true));
      await waitFor(() =>
        expect(
          screen.getByText('We could not confirm whether your change was saved.'),
        ).toBeVisible(),
      );
      expect(control()).toHaveAttribute('aria-checked', 'true');
      expect(puts()).toHaveLength(1);
    },
  );

  it('keeps an uncertain write locked when reconciliation fails and retries only GET', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ us_only: false }))
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockRejectedValueOnce(new Error('Read unavailable'))
      .mockResolvedValueOnce(json({ us_only: true }));
    render(<UsOnlyRoutingPanel />);
    await waitFor(() => expect(control()).toBeEnabled());
    act(() => retained()(true));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Retry loading' })).toBeVisible(),
    );
    expect(control()).toBeDisabled();
    act(() => screen.getByRole('button', { name: 'Retry loading' }).click());
    await waitFor(() => expect(control()).toBeEnabled());
    expect(control()).toHaveAttribute('aria-checked', 'true');
    expect(puts()).toHaveLength(1);
  });

  it('preserves acknowledgement without claiming latest readiness when readback fails', async () => {
    fetchMock
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ us_only: true }))
      .mockRejectedValueOnce(new Error('Read unavailable'));
    render(<UsOnlyRoutingPanel />);
    await waitFor(() => expect(control()).toBeEnabled());
    act(() => retained()(true));
    await waitFor(() =>
      expect(screen.getByText(/was saved as on, but the latest setting/)).toBeVisible(),
    );
    expect(control()).toBeDisabled();
    expect(control()).toHaveAttribute('aria-checked', 'true');
  });

  it('reacquires a usable view after StrictMode effect cleanup and setup', async () => {
    fetchMock.mockImplementation(async (_input, init) =>
      json(init?.method === 'PUT' ? { us_only: true } : {}),
    );
    render(
      <StrictMode>
        <UsOnlyRoutingPanel />
      </StrictMode>,
    );
    await waitFor(() => expect(control()).toBeEnabled());
    act(() => {
      const save = retained();
      save(true);
      save(true);
    });
    await waitFor(() => expect(screen.getByText(/was saved as on/)).toBeVisible());
    expect(puts()).toHaveLength(1);
  });
});

type MockedModule0 = typeof import('@/lib/clerk-session');
type MockedModule1 = typeof import('@/lib/client/csrf');
type MockedModule2 = typeof import('@agiworkforce/ui');
