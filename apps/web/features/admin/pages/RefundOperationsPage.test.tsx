import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => headers),
}));

import RefundOperationsPage from './RefundOperationsPage';

const STORE_REQUEST = {
  id: '5d1f7a52-3a4c-4f4e-9c61-2f7d8f0c1a11',
  userId: 'user_1',
  chargeId: 'mobile_iap:ios:2000000123',
  chargeKind: 'plan',
  chargeAmountCents: 2_000,
  chargeCurrency: 'usd',
  chargeCreatedAt: '2026-10-01T00:00:00.000Z',
  reason: 'technical_problem',
  details: null,
  assessment: 'needs_review',
  assessedRefundCents: null,
  status: 'pending',
  refundAmountCents: null,
  decisionNote: null,
  decidedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  billingCountry: null,
  statutoryWithdrawal: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const fetchMock = vi.fn();

function serveQueue(decision: { customerNotified: boolean }) {
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return jsonResponse({ request: STORE_REQUEST, ...decision });
    return jsonResponse({ pending: [STORE_REQUEST] });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

async function confirmStoreRefund() {
  render(<RefundOperationsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Record App Store refund' }));
  fireEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Record refund' }),
  );
}

async function confirmDecline() {
  render(<RefundOperationsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));
  fireEvent.change(screen.getByLabelText(/Reason, sent to the customer/), {
    target: { value: 'Outside the refund window' },
  });
  fireEvent.click(screen.getAllByRole('button', { name: 'Decline' }).at(-1) as Element);
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Decline' }));
}

describe('the decision receipts', () => {
  it('says the customer was told after a store refund whose notification was saved', async () => {
    serveQueue({ customerNotified: true });
    await confirmStoreRefund();

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('The request is closed as refunded by App Store.');
    expect(notice).toHaveTextContent('The customer was told.');
  });

  it('does not say the customer was told after a store refund whose notification was not saved', async () => {
    serveQueue({ customerNotified: false });
    await confirmStoreRefund();

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('The request is closed as refunded by App Store.');
    expect(notice).toHaveTextContent('they have not been told');
    expect(notice).not.toHaveTextContent('The customer was told');
  });

  it('says the customer was told why after a decline whose notification was saved', async () => {
    serveQueue({ customerNotified: true });
    await confirmDecline();

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent('The customer was told why.');
  });

  it('does not say the customer was told why after a decline whose notification was not saved', async () => {
    serveQueue({ customerNotified: false });
    await confirmDecline();

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('The request was declined.'),
    );
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('they have not been told');
    expect(notice).not.toHaveTextContent('told why');
  });
});

type ImportedModule0 = typeof import('@/lib/client/csrf');
