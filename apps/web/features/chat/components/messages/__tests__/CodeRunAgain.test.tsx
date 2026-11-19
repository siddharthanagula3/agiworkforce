import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

type CsrfModule = typeof import('@/lib/client/csrf');

vi.mock('@agiworkforce/unified-chat', () => ({ useCapability: () => true }));
vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  addCsrfHeaders: async (headers: Record<string, string>) => headers,
}));

const { CodeRunAgain } = await import('../CodeRunAgain');

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function sentBodies(): unknown[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
}

describe('CodeRunAgain', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runs straight away when the server does not ask for approval', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, output: '1', error: null, images: [] }),
    );
    render(<CodeRunAgain conversationId="c1" language="python" code="print(1)" />);

    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));

    expect(await screen.findByText('1')).toBeTruthy();
    expect(sentBodies()).toEqual([{ language: 'python', code: 'print(1)' }]);
  });

  it('asks first under ask before every action and sends the approval only after confirming', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(409, {
          error: {
            code: 'approval_required',
            message:
              'Your approvals are set to ask before every action. Approve this run to start it.',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { ok: true, output: 'done', error: null, images: [] }),
      );
    render(<CodeRunAgain conversationId="c1" language="python" code="print(1)" />);

    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('Run this code again?');
    expect(dialog.textContent).toContain(
      "The code runs again in this chat's cloud sandbox and can change the files there.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();

    const confirmButtons = screen.getAllByRole('button', { name: 'Run again' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    expect(await screen.findByText('done')).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(sentBodies()).toEqual([
      { language: 'python', code: 'print(1)' },
      { language: 'python', code: 'print(1)', approved: true },
    ]);
  });

  it('runs nothing when the person cancels the confirmation', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { error: { code: 'approval_required', message: 'Approve first.' } }),
    );
    render(<CodeRunAgain conversationId="c1" language="python" code="print(1)" />);

    fireEvent.click(screen.getByRole('button', { name: 'Run again' }));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
