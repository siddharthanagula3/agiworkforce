import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ContentTakedownPanel from './ContentTakedownPanel';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: async (headers: Record<string, string>) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  }),
}));

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWx';

const TARGET = {
  kind: 'conversation-share' as const,
  token: TOKEN,
  ownerId: 'user_owner_of_share',
  title: 'a shared conversation that was reported',
  createdAt: '2026-09-01T10:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

function lookupThenTakedown() {
  return async (_url: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? jsonResponse({
          success: true,
          kind: TARGET.kind,
          token: TARGET.token,
          ownerId: TARGET.ownerId,
          title: TARGET.title,
        })
      : jsonResponse({ target: TARGET });
}

async function lookUp() {
  fireEvent.change(screen.getByLabelText('Public link or token'), { target: { value: TOKEN } });
  fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
  await screen.findByText(TARGET.title);
}

describe('ContentTakedownPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('asks for a token before it calls anything', async () => {
    mocks.fetch.mockImplementation(lookupThenTakedown());
    render(<ContentTakedownPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Paste the public link or its token.',
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('shows the resolved target with its owner before offering the removal', async () => {
    mocks.fetch.mockImplementation(lookupThenTakedown());
    render(<ContentTakedownPanel />);
    await lookUp();

    expect(screen.getByText('Shared conversation')).toBeInTheDocument();
    expect(screen.getByText(TARGET.ownerId)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeInTheDocument();
  });

  it('refuses to unpublish without a reason', async () => {
    mocks.fetch.mockImplementation(lookupThenTakedown());
    render(<ContentTakedownPanel />);
    await lookUp();

    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A reason is required');
    expect(
      mocks.fetch.mock.calls.some((call: unknown[]) => (call[1] as RequestInit)?.method === 'POST'),
    ).toBe(false);
  });

  it('confirms with the consequence, then posts the reason and reports the audited result', async () => {
    mocks.fetch.mockImplementation(lookupThenTakedown());
    render(<ContentTakedownPanel />);
    await lookUp();

    fireEvent.change(screen.getByLabelText('Reason, recorded on the audit entry'), {
      target: { value: 'rights holder notice 42' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));

    expect(
      await screen.findByText(/The public link stops resolving for everyone who holds it/),
    ).toBeInTheDocument();
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Unpublish' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Unpublished shared conversation');
    await waitFor(() => {
      const post = mocks.fetch.mock.calls.find(
        (call: unknown[]) => (call[1] as RequestInit)?.method === 'POST',
      );
      expect(post).toBeDefined();
      expect(String((post?.[1] as RequestInit)?.body)).toContain('rights holder notice 42');
    });
  });

  it('does not post when the operator cancels the confirmation', async () => {
    mocks.fetch.mockImplementation(lookupThenTakedown());
    render(<ContentTakedownPanel />);
    await lookUp();

    fireEvent.change(screen.getByLabelText('Reason, recorded on the audit entry'), {
      target: { value: 'policy removal' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));

    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(
        mocks.fetch.mock.calls.some(
          (call: unknown[]) => (call[1] as RequestInit)?.method === 'POST',
        ),
      ).toBe(false),
    );
  });

  it('says nothing public is served from an unknown token', async () => {
    mocks.fetch.mockImplementation(async () =>
      jsonResponse({ error: { message: 'No public content is served from that token' } }, 404),
    );
    render(<ContentTakedownPanel />);

    fireEvent.change(screen.getByLabelText('Public link or token'), { target: { value: TOKEN } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No public content is served from that token',
    );
  });
});
