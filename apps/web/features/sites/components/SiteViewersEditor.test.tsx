import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => headers),
  getCsrfToken: vi.fn(async () => 't'),
}));

const { SiteViewersEditor } = await import('./SiteViewersEditor');
const { SiteSharingOptions } = await import('./SiteSharingOptions');
const { InviteOnlyArtifact } = await import('@/app/shared-artifact/[token]/InviteOnlyArtifact');

afterEach(() => vi.unstubAllGlobals());

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
