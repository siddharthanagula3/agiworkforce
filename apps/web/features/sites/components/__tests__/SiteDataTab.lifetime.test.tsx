import { StrictMode, type ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toast } from 'sonner';
import { SiteDataTab } from '../SiteDataTab';
import { beginPublicationCleanup } from '../../stores/published-sites-store';
import type { PublishedSite, SiteData } from '../../services/sites-service';

type Confirmation = { onConfirm: () => unknown; onCancel?: () => void; description: string };
const observed = vi.hoisted(() => ({
  confirmations: [] as Confirmation[],
  retry: null as (() => void) | null,
  clear: null as (() => void) | null,
}));
vi.mock('@agiworkforce/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/ui')>();
  return {
    ...actual,
    useConfirmAction: () => ({ confirm: (request: Confirmation) => observed.confirmations.push(request), dialog: null }),
    Button: (props: ComponentProps<typeof actual.Button>) => {
      if (props.children === 'Try again') observed.retry = () => props.onClick?.({} as never);
      if (props.children === 'Clear shared data') observed.clear = () => props.onClick?.({} as never);
      return <actual.Button {...props} />;
    },
  };
});
vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const fetchMock = vi.fn<typeof fetch>();
const site: PublishedSite = {
  token: 'a'.repeat(24), artifactId: 'artifact-1', conversationId: null,
  title: 'Scoreboard', kind: 'html', language: null, contentChars: 12, version: 8,
  visibility: 'public', createdAt: '2026-11-06T00:00:00.000Z',
  updatedAt: '2026-11-06T00:00:00.000Z', sandboxed: true,
  shareUrl: `https://example.test/shared-artifact/${'a'.repeat(24)}`,
};
const data = (count = 2): SiteData => ({
  supported: true, ownPersonalEntryCount: 1,
  shared: { entries: [], entryCount: count, totalBytes: 0, limitBytes: 1024 },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');
const reads = () => fetchMock.mock.calls.filter(([, init]) => init?.method !== 'DELETE');
async function requestClear() {
  fireEvent.click(await screen.findByRole('button', { name: 'Clear shared data' }));
  return observed.confirmations.at(-1)!;
}
beforeEach(() => {
  vi.resetAllMocks();
  observed.confirmations = [];
  observed.retry = null;
  observed.clear = null;
  beginPublicationCleanup()();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(addCsrfHeaders).mockResolvedValue({ 'X-CSRF-Token': 'csrf' });
  fetchMock.mockImplementation(async (_input, init) => init?.method === 'DELETE'
    ? Response.json({ cleared: 2 }) : Response.json(data()));
});
afterEach(() => { cleanup(); beginPublicationCleanup()(); vi.unstubAllGlobals(); });

describe('Shared data lifetime (UNRUN source fixtures)', () => {
  it.each(['unmount', 'token', 'lease'] as const)('blocks deferred CSRF dispatch after %s retirement', async (retirement) => {
    const csrf = deferred<Record<string, string>>();
    vi.mocked(addCsrfHeaders).mockReturnValueOnce(csrf.promise);
    const mounted = render(<SiteDataTab site={site} />);
    const confirmation = await requestClear();
    act(() => { void confirmation.onConfirm(); });
    expect(addCsrfHeaders).toHaveBeenCalledTimes(1);
    if (retirement === 'unmount') mounted.unmount();
    else if (retirement === 'token') {
      mounted.rerender(<SiteDataTab site={{ ...site, token: 'b'.repeat(24) }} />);
      mounted.rerender(<SiteDataTab site={site} />);
    } else act(() => beginPublicationCleanup()());
    if (retirement !== 'unmount') await screen.findByTestId('site-data-summary');
    const count = reads().length;
    await act(async () => { csrf.resolve({ 'X-CSRF-Token': 'csrf' }); });
    await act(async () => { await confirmation.onConfirm(); });
    expect(writes()).toHaveLength(0);
    expect(reads()).toHaveLength(count);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    if (retirement !== 'unmount') {
      const fresh = await requestClear();
      await act(async () => { await fresh.onConfirm(); });
      expect(writes()).toHaveLength(1);
    }
  });

  it.each(['success', 'error', 'decode'] as const)('suppresses late %s, toast and refresh after unmount', async (outcome) => {
    const pending = deferred<Response>();
    const body = deferred<unknown>();
    const decoding = deferred<void>();
    const response = Response.json({});
    vi.spyOn(response, 'json').mockImplementation(() => { decoding.resolve(); return body.promise; });
    fetchMock.mockImplementation(async (_input, init) => init?.method === 'DELETE'
      ? outcome === 'decode' ? response : pending.promise : Response.json(data()));
    const mounted = render(<SiteDataTab site={site} />);
    const confirmation = await requestClear();
    act(() => { void confirmation.onConfirm(); });
    await waitFor(() => expect(writes()).toHaveLength(1));
    if (outcome === 'decode') await decoding.promise;
    mounted.unmount();
    await act(async () => {
      if (outcome === 'decode') body.resolve({ cleared: 2 });
      else if (outcome === 'error') pending.reject(new Error('late failure'));
      else pending.resolve(Response.json({ cleared: 2 }));
    });
    expect(reads()).toHaveLength(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it.each([0, 2])('admits duplicate confirmation once and refreshes once for cleared=%s', async (cleared) => {
    const pending = deferred<Response>();
    fetchMock.mockImplementation(async (_input, init) => init?.method === 'DELETE' ? pending.promise : Response.json(data()));
    render(<SiteDataTab site={site} />);
    const confirmation = await requestClear();
    const oldOpener = observed.clear!;
    act(() => { void confirmation.onConfirm(); void confirmation.onConfirm(); oldOpener(); });
    await waitFor(() => expect(writes()).toHaveLength(1));
    await act(async () => pending.resolve(Response.json({ cleared })));
    await waitFor(() => expect(reads()).toHaveLength(2));
    expect(toast.success).toHaveBeenCalledExactlyOnceWith(`Cleared ${cleared} entries of shared data`);
    await act(async () => { await confirmation.onConfirm(); oldOpener(); });
    expect(writes()).toHaveLength(1);
    expect(observed.confirmations).toHaveLength(1);
    expect(writes()[0]?.[1]).toEqual(expect.objectContaining({
      credentials: 'include', headers: { 'X-CSRF-Token': 'csrf' }, signal: expect.any(AbortSignal),
    }));
    expect(writes()[0]?.[1]?.headers).not.toHaveProperty('Authorization');
  });

  it('shows a current error and performs only the existing guarded refresh', async () => {
    fetchMock.mockImplementation(async (_input, init) => init?.method === 'DELETE'
      ? Response.json({ error: 'Clear refused' }, { status: 403 }) : Response.json(data()));
    render(<SiteDataTab site={site} />);
    const confirmation = await requestClear();
    await act(async () => { await confirmation.onConfirm(); });
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(1);
    expect(reads()).toHaveLength(2);
  });

  it('retires cancelled callbacks without cancelling a newer confirmation', async () => {
    render(<SiteDataTab site={site} />);
    const old = await requestClear();
    expect(old.description).toContain('2 entries');
    act(() => old.onCancel?.());
    const fresh = await requestClear();
    act(() => old.onCancel?.());
    await act(async () => { await old.onConfirm(); });
    expect(writes()).toHaveLength(0);
    await act(async () => { await fresh.onConfirm(); });
    expect(writes()).toHaveLength(1);
  });

  it('rejects unopened retained confirmation after token and lease round trips', async () => {
    const mounted = render(<SiteDataTab site={site} />);
    const old = await requestClear();
    mounted.rerender(<SiteDataTab site={{ ...site, token: 'b'.repeat(24) }} />);
    mounted.rerender(<SiteDataTab site={site} />);
    act(() => beginPublicationCleanup()());
    await screen.findByTestId('site-data-summary');
    await act(async () => { await old.onConfirm(); });
    expect(writes()).toHaveLength(0);
    expect(addCsrfHeaders).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)('ignores late read %s across token replacement', async (outcome) => {
    const old = deferred<Response>();
    fetchMock.mockReturnValueOnce(old.promise);
    const mounted = render(<SiteDataTab site={site} />);
    mounted.rerender(<SiteDataTab site={{ ...site, token: 'b'.repeat(24) }} />);
    mounted.rerender(<SiteDataTab site={site} />);
    await screen.findByTestId('site-data-summary');
    await act(async () => outcome === 'resolve' ? old.resolve(Response.json(data(99))) : old.reject(new Error('old read')));
    expect(screen.getByTestId('site-data-summary')).toHaveTextContent('2 entries');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(reads()[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('binds Retry to its accepted error, not subsequent data or an overlapping read', async () => {
    const pending = deferred<Response>();
    fetchMock.mockRejectedValueOnce(new Error('unavailable')).mockReturnValueOnce(pending.promise);
    render(<SiteDataTab site={site} />);
    await screen.findByRole('button', { name: 'Try again' });
    const retry = observed.retry!;
    act(() => { retry(); retry(); });
    expect(reads()).toHaveLength(2);
    await act(async () => pending.resolve(Response.json(data(3))));
    expect(screen.getByTestId('site-data-summary')).toHaveTextContent('3 entries');
    act(() => retry());
    expect(reads()).toHaveLength(2);
    const confirmation = await requestClear();
    expect(confirmation.description).toContain('3 entries');
  });

  it('retires the first StrictMode lane and accepts the fresh lane', async () => {
    const old = deferred<Response>();
    fetchMock.mockReturnValueOnce(old.promise);
    render(<StrictMode><SiteDataTab site={site} /></StrictMode>);
    await screen.findByTestId('site-data-summary');
    await act(async () => old.resolve(Response.json(data(99))));
    expect(screen.getByTestId('site-data-summary')).toHaveTextContent('2 entries');
    const confirmation = await requestClear();
    await act(async () => { await confirmation.onConfirm(); });
    expect(writes()).toHaveLength(1);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });
});
