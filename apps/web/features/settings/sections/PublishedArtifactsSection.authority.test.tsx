import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH, managedCloudPublishedArtifactPath, managedCloudPublishedArtifactVersionPath, managedCloudPublishedArtifactVersionsPath } from '@agiworkforce/cloud-contracts';
import type { SessionAuthority } from '@/lib/identity/request-authority';
import { PublishedArtifactsSection } from './PublishedArtifactsSection';

const boundary = vi.hoisted(() => ({
  session: null as SessionAuthority | null,
  snapshot: vi.fn<() => SessionAuthority | null>(),
  listeners: new Set<() => void>(),
  fetch: vi.fn<typeof fetch>(),
  csrf: vi.fn<() => Promise<Record<string, string>>>(),
  clipboard: vi.fn<(text: string) => Promise<void>>(),
}));
vi.mock('@/lib/identity/useSessionSnapshot', () => ({ useSessionSnapshot: () => boundary.snapshot }));
vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: () => boundary.csrf() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function session(userId = 'owner-a', sessionId = 'session-a'): SessionAuthority {
  const captured: SessionAuthority = {
    userId, sessionId,
    isCurrent: () => boundary.session === captured,
    getToken: vi.fn(async () => `token-${sessionId}`),
    subscribe: (listener) => {
      boundary.listeners.add(listener);
      return () => { boundary.listeners.delete(listener); };
    },
  };
  return captured;
}
function observe(next: SessionAuthority | null) {
  act(() => {
    boundary.session = next;
    for (const listener of [...boundary.listeners]) listener();
  });
}
function artifact(token = 'a'.repeat(24), title = 'Owner A page') {
  return { token, artifactId: `artifact-${token}`, conversationId: null, title,
    kind: 'html' as const, language: null, contentChars: 10, version: 4,
    visibility: 'public' as const, createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z', shareUrl: `https://example.test/shared-artifact/${token}`, sandboxed: true };
}
function inventory(rows = [artifact()]) { return Response.json({ artifacts: rows, workspace: null }); }
function history() {
  return Response.json({ versions: [
    { version: 4, title: 'Owner A page', kind: 'html', createdAt: '2026-11-01', live: true },
    { version: 2, title: 'Earlier page', kind: 'html', createdAt: '2026-10-01', live: false },
  ] });
}
const writes = () => boundary.fetch.mock.calls.filter(([, init]) => ['DELETE', 'POST'].includes(init?.method ?? 'GET'));
async function show() {
  const mounted = render(<PublishedArtifactsSection />);
  await screen.findByText('Owner A page');
  return mounted;
}
async function openConfirmation() {
  fireEvent.click(screen.getByRole('button', { name: 'Unpublish', exact: true }));
  return screen.findByRole('alertdialog');
}
async function confirm() {
  const dialog = await openConfirmation();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Unpublish artifact', exact: true }));
}
async function openHistory() {
  fireEvent.click(screen.getByRole('button', { name: 'History', exact: true }));
  return screen.findByRole('button', { name: 'Put live', exact: true });
}
function noOldFeedback() {
  expect(screen.queryByText('Owner A page')).toBeNull();
  expect(screen.queryByText(/Copied the link|Unpublished|is live again|old failure/)).toBeNull();
  expect(screen.queryByRole('alertdialog')).toBeNull();
}

beforeEach(() => {
  boundary.listeners.clear();
  boundary.snapshot.mockReset().mockImplementation(() => boundary.session);
  boundary.session = session();
  boundary.csrf.mockReset().mockResolvedValue({ 'X-CSRF-Token': 'csrf-a' });
  boundary.clipboard.mockReset().mockResolvedValue(undefined);
  boundary.fetch.mockReset().mockImplementation(async (input, init) => {
    if (init?.method === 'DELETE') return Response.json({ success: true, token: artifact().token });
    if (init?.method === 'POST') return Response.json({ token: artifact().token, version: 5 });
    if (String(input) === managedCloudPublishedArtifactVersionsPath(artifact().token)) return history();
    return inventory();
  });
  vi.stubGlobal('fetch', boundary.fetch);
  vi.stubGlobal('navigator', { clipboard: { writeText: boundary.clipboard } });
  vi.spyOn(window, 'open').mockReturnValue(null);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('published artifacts session lifetime (UNRUN source fixtures)', () => {
  it('does not treat an unavailable session as an empty published inventory', async () => {
    boundary.session = null;
    render(<PublishedArtifactsSection />);
    await act(async () => {});
    expect(boundary.fetch).not.toHaveBeenCalled();
    expect(screen.queryByText('No published artifacts')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Unpublish', exact: true })).toBeNull();
  });

  it('keeps the admitted account-wide view across ordinary rerenders', async () => {
    const mounted = await show();
    const captures = boundary.snapshot.mock.calls.length;
    mounted.rerender(<PublishedArtifactsSection />);
    expect(boundary.snapshot).toHaveBeenCalledTimes(captures);
    expect(boundary.fetch).toHaveBeenCalledTimes(1);
    expect(boundary.listeners.size).toBe(1);
    expect(screen.getByText('Owner A page')).toBeInTheDocument();
  });

  it('loads with captured credentials, guards Open, and cancels without a mutation', async () => {
    await show();
    expect(new Headers(boundary.fetch.mock.calls[0]![1]?.headers).get('Authorization')).toBe('Bearer token-session-a');
    expect(boundary.fetch.mock.calls[0]![1]?.credentials).toBe('omit');
    expect(screen.queryByRole('link', { name: 'Open' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(window.open).toHaveBeenCalledWith(artifact().shareUrl, '_blank', 'noopener,noreferrer');
    const dialog = await openConfirmation();
    expect(dialog).toHaveTextContent('Owner A page');
    expect(dialog).toHaveTextContent(/lose access/);
    expect(dialog).toHaveTextContent('any data the site saved for its visitors is deleted');
    expect(dialog).toHaveTextContent('This cannot be undone.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(writes()).toHaveLength(0);
    expect(boundary.csrf).not.toHaveBeenCalled();
  });

  it('confirms exactly one DELETE for the displayed token', async () => {
    await show();
    const dialog = await openConfirmation();
    const button = within(dialog).getByRole('button', { name: 'Unpublish artifact' });
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    await screen.findByText(/Unpublished/);
    expect(writes()).toHaveLength(1);
    expect(writes()[0]![0]).toBe(managedCloudPublishedArtifactPath(artifact().token));
    expect(screen.getByText('No published artifacts')).toBeInTheDocument();
  });

  it('restores with one canonical bodyless POST and then refreshes by GET', async () => {
    await show();
    const putLive = await openHistory();
    act(() => { fireEvent.click(putLive); fireEvent.click(putLive); });
    await waitFor(() => expect(writes()).toHaveLength(1));
    await waitFor(() => expect(boundary.fetch.mock.calls.filter(([url, init]) => String(url) === MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH && !init?.method)).toHaveLength(2));
    expect(writes()[0]![0]).toBe(managedCloudPublishedArtifactVersionPath(artifact().token, 2));
    expect(writes()[0]![1]).not.toHaveProperty('body');
  });

  it('keeps an acknowledged restore distinct from a failed inventory refresh', async () => {
    await show();
    const putLive = await openHistory();
    boundary.fetch.mockImplementation(async (_url, init) => {
      if (init?.method === 'POST') return Response.json({ token: artifact().token, version: 5 });
      return Response.json({ error: { message: 'Inventory unavailable' } }, { status: 503 });
    });
    fireEvent.click(putLive);
    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('Version 2 of “Owner A page” is live again.');
    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent('Could not confirm whether that version was put live');
    expect(screen.getByRole('status')).toBe(notice);
    expect(screen.queryByRole('button', { name: 'Put live', exact: true })).toBeNull();
    expect(screen.queryByText('Owner A page')).toBeNull();
    expect(writes()).toHaveLength(1);
    expect(boundary.fetch.mock.lastCall?.[0]).toBe(MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH);
    expect(boundary.fetch.mock.lastCall?.[1]?.method ?? 'GET').toBe('GET');
    boundary.fetch.mockImplementation(async () => inventory());
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await screen.findByText('Owner A page');
    expect(writes()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Put live', exact: true })).toBeNull();
  });

  it.each(['account', 'session', 'unavailable'] as const)('retires rows/history/dialog on %s change', async (change) => {
    await show();
    await openHistory();
    await openConfirmation();
    boundary.fetch.mockImplementation(async () => inventory([artifact('b'.repeat(24), 'Owner B page')]));
    observe(change === 'unavailable' ? null : session(change === 'account' ? 'owner-b' : 'owner-a', 'session-b'));
    noOldFeedback();
    expect(screen.queryByText(/Earlier page/)).toBeNull();
    expect(writes()).toHaveLength(0);
    if (change !== 'unavailable') await screen.findByText('Owner B page');
  });

  it.each(['Open', 'Copy', 'History', 'Unpublish'])('rejects mounted %s before identity notification', async (action) => {
    await show();
    const button = screen.getByRole('button', { name: action, exact: true });
    boundary.session = session('owner-a', 'session-b');
    expect(button.isConnected).toBe(true);
    fireEvent.click(button);
    expect(window.open).not.toHaveBeenCalled();
    expect(boundary.clipboard).not.toHaveBeenCalled();
    expect(boundary.csrf).not.toHaveBeenCalled();
    expect(boundary.fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('rejects a mounted confirmation before notification without preparing CSRF', async () => {
    await show();
    const dialog = await openConfirmation();
    const button = within(dialog).getByRole('button', { name: 'Unpublish artifact' });
    boundary.session = session('owner-a', 'session-b');
    expect(button.isConnected).toBe(true);
    fireEvent.click(button);
    expect(boundary.csrf).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });

  it('rejects a mounted historical action before notification', async () => {
    await show();
    const button = await openHistory();
    boundary.session = session('owner-b', 'session-b');
    expect(button.isConnected).toBe(true);
    fireEvent.click(button);
    expect(boundary.csrf).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });

  it.each(['unpublish', 'restore'] as const)('blocks new writes after uncertain %s until a read-only retry', async (action) => {
    await show();
    const putLive = action === 'restore' ? await openHistory() : null;
    boundary.fetch.mockImplementation(async (_url, init) => {
      if (init?.method === 'DELETE' || init?.method === 'POST') throw new TypeError('Lost response');
      return inventory([artifact('b'.repeat(24), 'Fresh inventory')]);
    });
    if (putLive) fireEvent.click(putLive); else await confirm();
    const retry = await screen.findByRole('button', { name: 'Retry', exact: true });
    expect(writes()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Unpublish', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Put live', exact: true })).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.click(retry);
    await screen.findByText('Fresh inventory');
    expect(writes()).toHaveLength(1);
    expect(boundary.fetch.mock.lastCall?.[0]).toBe(MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH);
    expect(boundary.fetch.mock.lastCall?.[1]?.method ?? 'GET').toBe('GET');
  });

  it.each(['resolve', 'reject'] as const)('suppresses retired clipboard %s feedback', async (settlement) => {
    const pending = deferred<void>();
    boundary.clipboard.mockReturnValueOnce(pending.promise);
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    observe(null);
    await act(async () => { if (settlement === 'resolve') pending.resolve(); else pending.reject(new Error('old failure')); });
    noOldFeedback();
    expect(screen.queryByText(/Could not copy/)).toBeNull();
  });

  it.each(['list', 'history', 'unpublish', 'restore'] as const)('old %s rejection/finalizer cannot release replacement-session work', async (action) => {
    const oldResponse = deferred<Response>();
    if (action === 'list') {
      boundary.fetch.mockReturnValueOnce(oldResponse.promise);
      render(<PublishedArtifactsSection />);
      await waitFor(() => expect(boundary.fetch).toHaveBeenCalledTimes(1));
    } else {
      await show();
      const putLive = action === 'restore' ? await openHistory() : null;
      boundary.fetch.mockReturnValueOnce(oldResponse.promise);
      if (action === 'history') fireEvent.click(screen.getByRole('button', { name: 'History' }));
      else if (putLive) fireEvent.click(putLive);
      else await confirm();
      await waitFor(() => expect(boundary.fetch.mock.results.some((result) => result.value === oldResponse.promise)).toBe(true));
    }
    const oldSignal = boundary.fetch.mock.lastCall?.[1]?.signal;
    boundary.fetch.mockImplementation(async () => inventory([artifact('b'.repeat(24), 'Owner B page')]));
    observe(session('owner-b', 'session-b'));
    await screen.findByText('Owner B page');
    const newCopy = deferred<void>();
    boundary.clipboard.mockReturnValueOnce(newCopy.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(screen.getByRole('button', { name: 'Open' })).toBeDisabled();
    await act(async () => oldResponse.reject(new Error('old failure')));
    expect(oldSignal?.aborted).toBe(true);
    noOldFeedback();
    expect(screen.getByText('Owner B page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Unpublish', exact: true })).toBeDisabled();
    await act(async () => newCopy.resolve());
    expect(screen.getByRole('button', { name: 'Open' })).toBeEnabled();
  });

  it.each(['unpublish', 'restore'] as const)('retirement during %s CSRF prevents dispatch and stale settlement', async (action) => {
    await show();
    const putLive = action === 'restore' ? await openHistory() : null;
    const csrf = deferred<Record<string, string>>();
    boundary.csrf.mockReturnValueOnce(csrf.promise);
    if (putLive) fireEvent.click(putLive); else await confirm();
    await waitFor(() => expect(boundary.csrf).toHaveBeenCalledTimes(1));
    observe(null);
    await act(async () => csrf.resolve({ 'X-CSRF-Token': 'retired-csrf' }));
    expect(writes()).toHaveLength(0);
    noOldFeedback();
  });

  it('retires pending history on unmount and admits a usable StrictMode activation', async () => {
    const mounted = render(<StrictMode><PublishedArtifactsSection /></StrictMode>);
    await screen.findByText('Owner A page');
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await screen.findByText(/Copied the link/);
    const pending = deferred<Response>();
    boundary.fetch.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    await waitFor(() => expect(boundary.fetch.mock.lastCall?.[0]).toBe(managedCloudPublishedArtifactVersionsPath(artifact().token)));
    const signal = boundary.fetch.mock.lastCall?.[1]?.signal;
    mounted.unmount();
    expect(signal?.aborted).toBe(true);
    expect(boundary.listeners.size).toBe(0);
    await act(async () => pending.resolve(history()));
    expect(screen.queryByText(/Earlier page/)).toBeNull();
  });
});
