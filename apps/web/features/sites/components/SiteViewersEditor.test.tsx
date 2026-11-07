import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => headers),
  getCsrfToken: vi.fn(async () => 't'),
}));

const { SiteViewersEditor } = await import('./SiteViewersEditor');
const { SiteSharingOptions } = await import('./SiteSharingOptions');
const { InviteOnlyArtifact } = await import('@/app/shared-artifact/[token]/InviteOnlyArtifact');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function deferredResponse() {
  let resolve!: (response: Response) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Response>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function viewersResponse(emails: string[] = []) {
  return new Response(
    JSON.stringify({ viewers: emails.map((email) => ({ email, invitedAt: 'now' })) }),
  );
}

function enterEmail(value = 'ana@example.com') {
  fireEvent.change(screen.getByLabelText('Email address to share with'), { target: { value } });
}

function submitForm() {
  fireEvent.submit(screen.getByLabelText('Email address to share with').closest('form')!);
}

describe('sharing a site with named people', () => {
  it('offers invited people as an audience without a workspace', () => {
    const onChange = vi.fn();
    render(<SiteSharingOptions idPrefix="s" value="public" workspace={null} onChange={onChange} />);
    const option = screen.getByRole('radio', { name: /Only people you invite/ });
    expect(option).not.toBeDisabled();
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledWith('invited');
  });

  it('adds and removes people by email', async () => {
    let list: Array<{ email: string; invitedAt: string }> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as { email: string }) : null;
      if (init?.method === 'POST') list = [...list, { email: body!.email, invitedAt: 'now' }];
      if (init?.method === 'DELETE') list = list.filter((entry) => entry.email !== body!.email);
      return new Response(JSON.stringify({ viewers: list }));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SiteViewersEditor token="cccccccccccccccccccccccc" />);
    await screen.findByText(/Nobody yet/);
    fireEvent.change(screen.getByLabelText('Email address to share with'), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByTestId('site-viewer-add'));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a full email address');
    fireEvent.change(screen.getByLabelText('Email address to share with'), {
      target: { value: 'Ana@Example.com' },
    });
    fireEvent.click(screen.getByTestId('site-viewer-add'));
    const listItem = await screen.findByText('ana@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing with ana@example.com' }));
    await waitFor(() => expect(listItem).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.map(([, init]) => init?.method ?? 'GET')).toEqual([
      'GET',
      'POST',
      'DELETE',
    ]);
  });

  it('tells a signed-out visitor to sign in and a signed-in one they lack access', () => {
    const { rerender } = render(
      <InviteOnlyArtifact token="dddddddddddddddddddddddd" signedIn={false} />,
    );
    const page = screen.getByTestId('invite-only-artifact');
    expect(within(page).getByRole('heading')).toHaveTextContent('Sign in to open this');
    expect(within(page).getByRole('link', { name: 'Sign in' }).getAttribute('href')).toContain(
      'shared-artifact',
    );
    rerender(<InviteOnlyArtifact token="dddddddddddddddddddddddd" signedIn />);
    expect(screen.getByRole('heading')).toHaveTextContent('You do not have access');
  });
});


describe('site viewer request ownership', () => {
  it('admits no mutation until the delayed initial GET finishes', async () => {
    const initial = deferredResponse();
    const fetchMock = vi.fn()
      .mockReturnValueOnce(initial.promise)
      .mockResolvedValueOnce(viewersResponse(['ana@example.com']));
    vi.stubGlobal('fetch', fetchMock);
    render(<SiteViewersEditor token="first" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(screen.getByLabelText('Email address to share with')).toBeDisabled();
    expect(screen.getByTestId('site-viewer-add')).toBeDisabled();
    expect(screen.queryByText(/Nobody yet/)).not.toBeInTheDocument();
    enterEmail();
    submitForm();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => initial.resolve(viewersResponse()));
    await screen.findByText(/Nobody yet/);
    enterEmail();
    submitForm();
    await screen.findByRole('button', { name: 'Stop sharing with ana@example.com' });
    expect(screen.queryByText(/Nobody yet/)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([, init]) => init?.method ?? 'GET')).toEqual(['GET', 'POST']);
  });

  it('keeps failed loads unknown and serializes explicit retries', async () => {
    const initial = deferredResponse();
    const retry = deferredResponse();
    const fetchMock = vi.fn().mockReturnValueOnce(initial.promise).mockReturnValueOnce(retry.promise);
    vi.stubGlobal('fetch', fetchMock);
    render(<SiteViewersEditor token="first" />);
    await act(async () => initial.reject(new Error('offline')));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(/Nobody yet/)).not.toBeInTheDocument();
    enterEmail();
    submitForm();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const retryButton = screen.getByRole('button', { name: 'Retry' });
    act(() => {
      retryButton.click();
      retryButton.click();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    submitForm();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => retry.resolve(viewersResponse(['existing@example.com'])));
    expect(screen.getByRole('button', { name: 'Stop sharing with existing@example.com' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('admits only one same-tick submission and blocks removal during it', async () => {
    const mutation = deferredResponse();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(viewersResponse(['existing@example.com']))
      .mockReturnValueOnce(mutation.promise);
    vi.stubGlobal('fetch', fetchMock);
    render(<SiteViewersEditor token="first" />);
    const remove = await screen.findByRole('button', { name: 'Stop sharing with existing@example.com' });
    enterEmail();
    const form = screen.getByLabelText('Email address to share with').closest('form')!;
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      remove.click();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(remove).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Updating access…');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText(/Nobody yet/)).not.toBeInTheDocument();
    expect(screen.getByTestId('site-viewer-add')).toBeDisabled();
    await act(async () => mutation.resolve(viewersResponse(['existing@example.com', 'ana@example.com'])));
    expect(fetchMock.mock.calls.map(([, init]) => init?.method ?? 'GET')).toEqual(['GET', 'POST']);
    expect(screen.getByLabelText('Email address to share with')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Stop sharing with ana@example.com' })).toBeEnabled();
  });

  it.each(['add', 'remove'] as const)(
    'does not imply rollback or replay a rejected %s mutation',
    async (action) => {
      const mutation = deferredResponse();
      const before = action === 'add' ? [] : ['ana@example.com'];
      const after = action === 'add' ? ['ana@example.com'] : [];
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(viewersResponse(before))
        .mockReturnValueOnce(mutation.promise)
        .mockResolvedValueOnce(viewersResponse(after));
      vi.stubGlobal('fetch', fetchMock);
      render(<SiteViewersEditor token="first" />);
      await waitFor(() => expect(screen.getByLabelText('Email address to share with')).toBeEnabled());
      enterEmail();
      if (action === 'add') submitForm();
      else fireEvent.click(screen.getByRole('button', { name: 'Stop sharing with ana@example.com' }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(screen.getByRole('status')).toHaveTextContent('Updating access…');
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      expect(screen.queryByText(/Nobody yet/)).not.toBeInTheDocument();
      await act(async () => mutation.reject(new Error('response lost after persistence')));
      expect(screen.getByRole('alert')).toHaveTextContent('Access may have changed');
      expect(screen.queryByText(/Nobody yet/)).not.toBeInTheDocument();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Email address to share with')).toHaveValue('ana@example.com');
      expect(screen.getByTestId('site-viewer-add')).toBeDisabled();
      submitForm();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(screen.getByLabelText('Email address to share with')).toBeEnabled());
      expect(fetchMock.mock.calls.map(([, init]) => init?.method ?? 'GET')).toEqual([
        'GET', action === 'add' ? 'POST' : 'DELETE', 'GET',
      ]);
      if (action === 'add') expect(screen.getByText('ana@example.com')).toBeInTheDocument();
      else expect(screen.getByText(/Nobody yet/)).toBeInTheDocument();
    },
  );

  it.each(['resolve', 'reject'] as const)(
    'ignores an obsolete GET that %ss after a token replacement',
    async (outcome) => {
      const old = deferredResponse();
      const current = deferredResponse();
      const fetchMock = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
      vi.stubGlobal('fetch', fetchMock);
      const { rerender } = render(<SiteViewersEditor token="first" />);
      rerender(<SiteViewersEditor token="second" />);
      expect(fetchMock.mock.calls[0]![1].signal.aborted).toBe(true);
      await act(async () => current.resolve(viewersResponse(['current@example.com'])));
      await act(async () => {
        if (outcome === 'resolve') old.resolve(viewersResponse());
        else old.reject(new Error('obsolete failure'));
      });
      expect(screen.getByText('current@example.com')).toBeInTheDocument();
      expect(screen.queryByText(/Nobody yet/)).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it.each(['resolve', 'reject'] as const)(
    'ignores an obsolete mutation that %ss across token reuse',
    async (outcome) => {
      const mutation = deferredResponse();
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(viewersResponse())
        .mockReturnValueOnce(mutation.promise)
        .mockResolvedValueOnce(viewersResponse())
        .mockResolvedValueOnce(viewersResponse(['current@example.com']));
      vi.stubGlobal('fetch', fetchMock);
      const { rerender } = render(<SiteViewersEditor token="first" />);
      await screen.findByText(/Nobody yet/);
      enterEmail('old@example.com');
      submitForm();
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      rerender(<SiteViewersEditor token="second" />);
      await screen.findByText(/Nobody yet/);
      rerender(<SiteViewersEditor token="first" />);
      await screen.findByText('current@example.com');
      enterEmail('draft@example.com');
      await act(async () => {
        if (outcome === 'resolve') mutation.resolve(viewersResponse(['old@example.com']));
        else mutation.reject(new Error('obsolete failure'));
      });
      expect(screen.getByText('current@example.com')).toBeInTheDocument();
      expect(screen.queryByText('old@example.com')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Email address to share with')).toHaveValue('draft@example.com');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(4);
    },
  );

  it('ignores a load settling after unmount and remount', async () => {
    const old = deferredResponse();
    const fetchMock = vi.fn()
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(viewersResponse(['current@example.com']));
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = render(<SiteViewersEditor token="first" />);
    unmount();
    render(<SiteViewersEditor token="first" />);
    await screen.findByText('current@example.com');
    await act(async () => old.reject(new Error('unmounted failure')));
    expect(screen.getByText('current@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores the retired StrictMode load when it %ss after a mutation',
    async (outcome) => {
      const retired = deferredResponse();
      const fetchMock = vi.fn()
        .mockReturnValueOnce(retired.promise)
        .mockResolvedValueOnce(viewersResponse())
        .mockResolvedValueOnce(viewersResponse(['ana@example.com']));
      vi.stubGlobal('fetch', fetchMock);
      render(<StrictMode><SiteViewersEditor token="first" /></StrictMode>);
      await screen.findByText(/Nobody yet/);
      expect(fetchMock.mock.calls[0]![1].signal.aborted).toBe(true);
      enterEmail();
      submitForm();
      await screen.findByText('ana@example.com');
      await act(async () => {
        if (outcome === 'resolve') retired.resolve(viewersResponse());
        else retired.reject(new Error('retired failure'));
      });
      expect(screen.getByRole('button', { name: 'Stop sharing with ana@example.com' })).toBeEnabled();
      expect(screen.queryByText(/Nobody yet/)).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(fetchMock.mock.calls.map(([, init]) => init?.method ?? 'GET')).toEqual(['GET', 'GET', 'POST']);
    },
  );
});
