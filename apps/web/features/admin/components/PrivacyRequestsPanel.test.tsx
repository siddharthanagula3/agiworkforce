import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PrivacyRequestsPanel from './PrivacyRequestsPanel';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: async (headers: Record<string, string>) => ({
    ...headers,
    'x-csrf-token': 'csrf-token',
  }),
}));

const OPEN_REQUEST = {
  reference: 'DPDP-7Q2XKM40VB',
  requestType: 'erasure' as const,
  status: 'received' as const,
  createdAt: '2026-09-02T08:30:00.000Z',
  resolvedAt: null,
  contactEmail: 'subject@example.invalid',
  details: 'delete everything you hold about me',
  userId: null,
};

const COMPLETE_REPORT = {
  complete: true,
  deleted: 4,
  accountBound: 1,
  tables: {
    cloud_managed_waitlist: { deleted: 2, accountBound: 0 },
    consent_records: { deleted: 2, accountBound: 1 },
    data_rights_requests: { deleted: 0, accountBound: 0, skipped: true },
  },
};

const PARTIAL_REPORT = {
  complete: false,
  deleted: 2,
  accountBound: 0,
  tables: {
    cloud_managed_waitlist: { deleted: 2, accountBound: 0 },
    consent_records: { deleted: 0, accountBound: 0, error: 'permission denied for table' },
  },
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

function respondWith(requests: unknown[], erasure: { body: unknown; status: number }) {
  return async (_url: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? jsonResponse(erasure.body, erasure.status)
      : jsonResponse({ requests, count: requests.length });
}

async function submitErasure() {
  fireEvent.change(screen.getByLabelText('Subject email'), {
    target: { value: OPEN_REQUEST.contactEmail },
  });
  fireEvent.change(screen.getByLabelText('Reason, recorded on the audit entry'), {
    target: { value: `request ${OPEN_REQUEST.reference}` },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Erase subject' }));
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Erase subject' }));
}

describe('PrivacyRequestsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('says it is reading the queue before the request settles', () => {
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    render(<PrivacyRequestsPanel />);

    expect(screen.getByText('Reading the request queue…')).toBeInTheDocument();
  });

  it('lists an open request with its reference, kind and contact', async () => {
    mocks.fetch.mockImplementation(
      respondWith([OPEN_REQUEST], { body: COMPLETE_REPORT, status: 200 }),
    );
    render(<PrivacyRequestsPanel />);

    expect(await screen.findByText(OPEN_REQUEST.reference)).toBeInTheDocument();
    expect(screen.getByText('Erasure')).toBeInTheDocument();
    expect(screen.getByText(OPEN_REQUEST.contactEmail)).toBeInTheDocument();
    expect(screen.getByText('no account')).toBeInTheDocument();
  });

  it('names what would populate an empty queue', async () => {
    mocks.fetch.mockImplementation(respondWith([], { body: COMPLETE_REPORT, status: 200 }));
    render(<PrivacyRequestsPanel />);

    expect(await screen.findByText(/No request is open/)).toBeInTheDocument();
  });

  it('surfaces a failed queue read as an alert', async () => {
    mocks.fetch.mockImplementation(async () =>
      jsonResponse({ error: { message: 'Not found.' } }, 404),
    );
    render(<PrivacyRequestsPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load data rights requests.',
    );
  });

  it('requires an email and a reason before it will erase', async () => {
    mocks.fetch.mockImplementation(
      respondWith([OPEN_REQUEST], { body: COMPLETE_REPORT, status: 200 }),
    );
    render(<PrivacyRequestsPanel />);
    await screen.findByText(OPEN_REQUEST.reference);

    fireEvent.click(screen.getByRole('button', { name: 'Erase subject' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An email address and a reason are both required.',
    );
    expect(
      mocks.fetch.mock.calls.some((call: unknown[]) => (call[1] as RequestInit)?.method === 'POST'),
    ).toBe(false);
  });

  it('confirms with the consequence, then reports the per-table erasure result', async () => {
    mocks.fetch.mockImplementation(
      respondWith([OPEN_REQUEST], { body: COMPLETE_REPORT, status: 200 }),
    );
    render(<PrivacyRequestsPanel />);
    await screen.findByText(OPEN_REQUEST.reference);
    await submitErasure();

    expect(await screen.findByRole('status')).toHaveTextContent('Erased 4 row(s)');
    expect(screen.getByText('consent_records')).toBeInTheDocument();
    expect(screen.getByText('not present in this schema')).toBeInTheDocument();
    await waitFor(() => {
      const post = mocks.fetch.mock.calls.find(
        (call: unknown[]) => (call[1] as RequestInit)?.method === 'POST',
      );
      expect(String((post?.[1] as RequestInit)?.body)).toContain(OPEN_REQUEST.reference);
    });
  });

  it('shows a partial erasure as unfinished with the table that refused', async () => {
    mocks.fetch.mockImplementation(
      respondWith([OPEN_REQUEST], { body: PARTIAL_REPORT, status: 500 }),
    );
    render(<PrivacyRequestsPanel />);
    await screen.findByText(OPEN_REQUEST.reference);
    await submitErasure();

    expect(await screen.findByRole('status')).toHaveTextContent('Partly erased');
    expect(screen.getByText('permission denied for table')).toBeInTheDocument();
  });

  it('does not post when the operator cancels the confirmation', async () => {
    mocks.fetch.mockImplementation(
      respondWith([OPEN_REQUEST], { body: COMPLETE_REPORT, status: 200 }),
    );
    render(<PrivacyRequestsPanel />);
    await screen.findByText(OPEN_REQUEST.reference);

    fireEvent.change(screen.getByLabelText('Subject email'), {
      target: { value: OPEN_REQUEST.contactEmail },
    });
    fireEvent.change(screen.getByLabelText('Reason, recorded on the audit entry'), {
      target: { value: 'no' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Erase subject' }));
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
});
