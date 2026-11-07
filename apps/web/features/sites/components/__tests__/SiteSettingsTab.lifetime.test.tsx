import { StrictMode, type ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toast } from 'sonner';
import { SiteSettingsTab } from '../SiteSettingsTab';
import { beginPublicationCleanup } from '../../stores/published-sites-store';
import type { PublishedSite } from '../../services/sites-service';

const observed = vi.hoisted(() => ({ restore: null as (() => void) | null }));
vi.mock('@agiworkforce/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/ui')>();
  return {
    ...actual,
    Button: (props: ComponentProps<typeof actual.Button>) => {
      if (props.children === 'Restore') observed.restore = () => props.onClick?.({} as never);
      return <actual.Button {...props} />;
    },
  };
});
vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const fetchMock = vi.fn<typeof fetch>();
const site: PublishedSite = {
  token: 'a'.repeat(24),
  artifactId: 'artifact-1',
  conversationId: null,
  title: 'Scoreboard',
  kind: 'html',
  language: null,
  contentChars: 12,
  version: 8,
  visibility: 'public',
  createdAt: '2026-11-06T00:00:00.000Z',
  updatedAt: '2026-11-06T00:00:00.000Z',
  sandboxed: true,
  shareUrl: `https://example.test/shared-artifact/${'a'.repeat(24)}`,
};
const history = (version = 7) =>
  Response.json({
    versions: [
      { version, title: site.title, kind: site.kind, createdAt: site.createdAt, live: false },
    ],
  });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
function settings(target = site, onRestored = vi.fn()) {
  return (
    <SiteSettingsTab
      site={target}
      workspace={null}
      onRestored={onRestored}
      onCopyLink={vi.fn()}
      onRename={vi.fn()}
      onSetVisibility={vi.fn()}
      onUnpublish={vi.fn()}
    />
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  observed.restore = null;
  beginPublicationCleanup()();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(addCsrfHeaders).mockResolvedValue({ 'X-CSRF-Token': 'csrf' });
  fetchMock.mockImplementation(async (_input, init) =>
    init?.method === 'POST' ? Response.json({ token: site.token, version: 9 }) : history(),
  );
});
afterEach(() => {
  cleanup();
  beginPublicationCleanup()();
  vi.unstubAllGlobals();
});

describe('Versions ownership (UNRUN source fixtures)', () => {
  it('admits one same-turn callback and consumes acknowledged history until refreshed', async () => {
    const restored = vi.fn();
    render(settings(site, restored));
    await screen.findByRole('button', { name: 'Restore' });
    const retained = observed.restore!;
    act(() => {
      retained();
      retained();
    });
    await waitFor(() => expect(restored).toHaveBeenCalledTimes(1));
    act(() => retained());
    expect(writes()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Restore' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Restore confirmed');
  });

  it.each(['token', 'artifactId', 'version', 'visibility', 'updatedAt'] as const)(
    'rejects retained history and CSRF completion after %s replacement',
    async (field) => {
      const csrf = deferred<Record<string, string>>();
      vi.mocked(addCsrfHeaders).mockReturnValueOnce(csrf.promise);
      const mounted = render(settings());
      await screen.findByRole('button', { name: 'Restore' });
      const retained = observed.restore!;
      act(() => retained());
      const next = {
        ...site,
        [field]:
          field === 'version'
            ? 9
            : field === 'visibility'
              ? 'organization'
              : field === 'token'
                ? 'b'.repeat(24)
                : 'replacement',
      };
      mounted.rerender(settings(next));
      await screen.findByRole('button', { name: 'Restore' });
      act(() => retained());
      await act(async () => csrf.resolve({ 'X-CSRF-Token': 'csrf' }));
      expect(writes()).toHaveLength(0);
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it.each(['resolve', 'reject'] as const)(
    'ignores old history %s after a token round trip',
    async (outcome) => {
      const old = deferred<Response>();
      fetchMock.mockReturnValueOnce(old.promise);
      const mounted = render(settings());
      mounted.rerender(settings({ ...site, token: 'b'.repeat(24) }));
      mounted.rerender(settings());
      await screen.findByText('Version 7');
      await act(async () =>
        outcome === 'resolve' ? old.resolve(history(3)) : old.reject(new Error('old failure')),
      );
      expect(screen.queryByText('Version 3')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('suppresses late success after unmount and rejects its retained callback', async () => {
    const pending = deferred<Response>();
    fetchMock.mockImplementation(async (_input, init) =>
      init?.method === 'POST' ? pending.promise : history(),
    );
    const restored = vi.fn();
    const mounted = render(settings(site, restored));
    await screen.findByRole('button', { name: 'Restore' });
    const retained = observed.restore!;
    act(() => retained());
    await waitFor(() => expect(writes()).toHaveLength(1));
    mounted.unmount();
    act(() => retained());
    await act(async () => pending.resolve(Response.json({ token: site.token, version: 9 })));
    expect(writes()).toHaveLength(1);
    expect(restored).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('retires a lease round trip without disabling the replacement operation', async () => {
    const pending = deferred<Response>();
    fetchMock
      .mockImplementationOnce(async () => history())
      .mockImplementationOnce(() => pending.promise);
    render(settings());
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    act(() => beginPublicationCleanup()());
    await screen.findByRole('button', { name: 'Restore' });
    await act(async () => pending.reject(new Error('old failure')));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeEnabled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('does not reactivate the first StrictMode history request', async () => {
    const old = deferred<Response>();
    fetchMock.mockReturnValueOnce(old.promise);
    render(<StrictMode>{settings()}</StrictMode>);
    await screen.findByText('Version 7');
    await act(async () => old.resolve(history(3)));
    expect(screen.queryByText('Version 3')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
  });
});
