import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: async (headers: HeadersInit = {}) => ({ ...headers, 'x-csrf-token': 'token' }),
}));

import { ArticleFeedback } from './ArticleFeedback';

const fetchMock = vi.fn<typeof fetch>();

function renderFeedback() {
  return render(
    <ArticleFeedback
      articleId="billing-and-plans"
      articleTitle="Plans and billing"
      path="/help/billing-and-plans"
    />,
  );
}

function sentBodies(): Array<{
  subject: string;
  message: string;
  metadata: Record<string, unknown>;
}> {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
}

describe('help article feedback', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('{"success":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts with both votes unselected and no comment field', () => {
    renderFeedback();

    expect(screen.getByRole('heading', { name: 'Was this article helpful?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'No' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByPlaceholderText('Additional feedback (optional)')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the vote through the feedback route and reveals the optional field', async () => {
    const user = userEvent.setup();
    renderFeedback();

    await user.click(screen.getByRole('button', { name: 'Yes' }));

    await screen.findByPlaceholderText('Additional feedback (optional)');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/feedback');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'x-csrf-token': 'token' });
    const [body] = sentBodies();
    expect(body?.subject).toBe('Help article rated helpful: Plans and billing');
    expect(body?.metadata).toMatchObject({
      source: 'web',
      rating: 'up',
      page_path: '/help/billing-and-plans',
    });
    expect(body?.metadata).not.toHaveProperty('feedback_context');
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Yes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'No' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Thanks for the feedback.');
  });

  it('keeps Submit disabled while the field is empty and sends the comment without a second vote', async () => {
    const user = userEvent.setup();
    renderFeedback();
    await user.click(screen.getByRole('button', { name: 'No' }));
    const field = await screen.findByPlaceholderText('Additional feedback (optional)');
    const submit = screen.getByRole('button', { name: 'Submit' });

    expect(field).toHaveValue('');
    expect(submit).toBeDisabled();
    await user.type(field, '   ');
    expect(submit).toBeDisabled();
    await user.type(field, 'The refund steps are out of date.');
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = sentBodies()[1];
    expect(body?.message).toBe('The refund steps are out of date.');
    expect(body?.subject).toBe('Help article comment (not helpful): Plans and billing');
    expect(body?.metadata).not.toHaveProperty('rating');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Thanks, your feedback was sent.'),
    );
    expect(screen.queryByPlaceholderText('Additional feedback (optional)')).not.toBeInTheDocument();
  });

  it('reports a failed vote and lets the reader try again', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    renderFeedback();

    await user.click(screen.getByRole('button', { name: 'Yes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not send your feedback. Try again.',
    );
    expect(screen.getByRole('button', { name: 'Yes' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByPlaceholderText('Additional feedback (optional)')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Yes' }));
    await screen.findByPlaceholderText('Additional feedback (optional)');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the typed comment when sending it fails', async () => {
    const user = userEvent.setup();
    renderFeedback();
    await user.click(screen.getByRole('button', { name: 'Yes' }));
    const field = await screen.findByPlaceholderText('Additional feedback (optional)');
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 429 }));

    await user.type(field, 'Clear and short.');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(field).toHaveValue('Clear and short.');
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
  });
});
