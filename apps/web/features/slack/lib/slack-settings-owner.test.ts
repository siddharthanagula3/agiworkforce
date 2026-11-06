import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';
import { getCsrfToken } from '@/lib/client/csrf';
import { createSlackSettingsView } from './slack-settings-owner';

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/client/csrf')>(),
  getCsrfToken: vi.fn(async () => 'csrf'),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}
function setup(organizationId: string | null = null) {
  let current = true;
  const getToken = vi.fn(async () => 'captured-token');
  const session = { userId: 'a', sessionId: 'session-a', isCurrent: () => current, getToken };
  const view = createSlackSettingsView(session, () => current, organizationId);
  view.activate();
  return { view, getToken, retireSession: () => { current = false; } };
}
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.mocked(getCsrfToken).mockReset().mockResolvedValue('csrf');
  fetchMock.mockReset().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('Slack settings view authority', () => {
  it.each([null, 'organization-a'])('captures bearer and explicit scope %s', async (organizationId) => {
    const { view } = setup(organizationId);
    const operation = view.begin(() => true)!;
    expect(operation.start()).toBe(true);
    await view.send(operation.request, '/api/slack/test', { method: 'PUT', body: { mode: 'off' } });
    const init = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer captured-token');
    expect(headers.get(MANAGED_CLOUD_ORGANIZATION_HEADER)).toBe(
      organizationId ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE);
    expect(headers.get('x-csrf-token')).toBe('csrf');
    expect(init?.credentials).toBe('omit');
    expect(init?.cache).toBe('no-store');
    expect(operation.dispatched).toBe(true);
  });

  it('admits one synchronous operation including confirmation waiting and reentrant listeners', () => {
    const { view } = setup();
    let attempted = false;
    view.subscribe(() => {
      if (!attempted) { attempted = true; expect(view.begin(() => true)).toBeNull(); }
    });
    const operation = view.begin(() => true)!;
    expect(view.begin(() => true)).toBeNull();
    expect(operation.start()).toBe(true);
    expect(operation.start()).toBe(false);
    operation.finish();
    const next = view.begin(() => true)!;
    operation.finish();
    expect(view.blocked()).toBe(true);
    expect(next.start()).toBe(true);
  });

  it('releases only a stale unstarted reservation, including reentrant target replacement', () => {
    const { view } = setup();
    let targetCurrent = true;
    view.subscribe(() => { targetCurrent = false; });
    const old = view.begin(() => targetCurrent)!;
    expect(old.start()).toBe(false);
    expect(view.blocked()).toBe(false);
    const next = view.begin(() => true)!;
    expect(next.start()).toBe(true);
    old.finish();
    expect(view.blocked()).toBe(true);
    next.cancel();
    expect(view.blocked()).toBe(true);
  });

  it('retires waiting confirmation without admitting its retained callback after reactivation', () => {
    const { view } = setup();
    const old = view.begin(() => true)!;
    view.retire();
    view.activate();
    const next = view.begin(() => true)!;
    expect(old.start()).toBe(false);
    old.finish();
    expect(view.blocked()).toBe(true);
    expect(next.start()).toBe(true);
  });

  it.each(['csrf', 'token'])('cannot dispatch when retired during deferred %s', async (stage) => {
    const { view, getToken } = setup();
    const pause = deferred<string>();
    if (stage === 'csrf') vi.mocked(getCsrfToken).mockReturnValueOnce(pause.promise);
    else getToken.mockReturnValueOnce(pause.promise);
    const operation = view.begin(() => true)!;
    operation.start();
    const pending = view.send(operation.request, '/api/slack/test', { method: 'DELETE' });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    view.retire();
    pause.resolve('late-value');
    await rejected;
    expect(fetchMock).not.toHaveBeenCalled();
    expect(operation.dispatched).toBe(false);
  });

  it('rechecks session even without a subscription notification', async () => {
    const { view, retireSession } = setup();
    const operation = view.begin(() => true)!;
    retireSession();
    expect(operation.start()).toBe(false);
    await expect(view.send(operation.request, '/api/slack/test', { method: 'DELETE' }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not release another mounted view and does not clear uncertain admission', () => {
    const first = setup().view;
    const second = setup().view;
    const old = first.begin(() => true)!;
    const other = second.begin(() => true)!;
    first.retire();
    old.finish();
    expect(other.start()).toBe(true);
    second.markUncertain();
    other.finish();
    expect(second.begin(() => true)).toBeNull();
    expect(second.uncertain()).toBe(true);
  });

  it('cannot send another view request with this view workspace header', async () => {
    const first = setup('first-org').view;
    const second = setup('second-org').view;
    const request = first.read()!;
    await expect(second.send(request, '/api/slack', { method: 'GET' }))
      .rejects.toThrow('another settings view');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retires response ownership and leaves dispatched outcome distinct from cancellation', async () => {
    const { view } = setup();
    const pause = deferred<Response>();
    fetchMock.mockReturnValueOnce(pause.promise);
    const operation = view.begin(() => true)!;
    operation.start();
    const pending = view.send(operation.request, '/api/slack/test', { method: 'POST' });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(operation.dispatched).toBe(true));
    view.retire();
    pause.resolve(new Response('{}'));
    await rejected;
    expect(operation.dispatched).toBe(true);
  });
});
