import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IdentitySessionState } from '@/lib/identity/client';
import type {
  RefundableChargeView,
  RefundRequestView,
  RefundRequestsResponse,
} from '@/lib/billing/refund-requests';

type IdentityClientModule = typeof import('@/lib/identity/client');
type ClientCsrfModule = typeof import('@/lib/client/csrf');

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
  addCsrfHeaders: vi.fn(),
}));

vi.mock('@/lib/identity/client', async (importOriginal) => ({
  ...(await importOriginal<IdentityClientModule>()),
  useSession: mocks.useSession,
}));
vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<ClientCsrfModule>()),
  addCsrfHeaders: mocks.addCsrfHeaders,
}));

import { RefundRequestForm } from './RefundRequestForm';

const ENDPOINT = '/api/billing/refund-requests';
const FIRST_USER = 'user_refund_first';
const SECOND_USER = 'user_refund_second';
const charge: RefundableChargeView = {
  id: 'ch_first_payment',
  kind: 'top_up',
  amountCents: 2_000,
  refundedCents: 0,
  refundableCents: 2_000,
  currency: 'usd',
  createdAt: '2026-09-20T10:00:00.000Z',
  billingCountry: null,
  disputed: false,
  withdrawalEligible: false,
  withdrawalRefundCents: null,
  withdrawalProrated: false,
  receiptUrl: null,
};
const requested: RefundRequestView = {
  id: 'refund_first',
  chargeId: charge.id,
  chargeKind: charge.kind,
  chargeAmountCents: charge.amountCents,
  chargeCurrency: charge.currency,
  chargeCreatedAt: charge.createdAt,
  reason: 'other',
  details: 'First account details',
  assessment: 'needs_review',
  assessedRefundCents: null,
  status: 'pending',
  refundAmountCents: null,
  decisionNote: null,
  decidedAt: null,
  createdAt: '2026-09-21T10:00:00.000Z',
};

function session(overrides: Partial<IdentitySessionState> = {}): IdentitySessionState {
  return {
    isLoaded: true,
    isSignedIn: true,
    userId: FIRST_USER,
    getToken: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function data(charges = [charge], requests: RefundRequestView[] = []): RefundRequestsResponse {
  return { charges, requests };
}

function deferredResponse<T = Response>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

async function completeForm() {
  fireEvent.change(await screen.findByLabelText('Payment'), { target: { value: charge.id } });
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'other' } });
  fireEvent.change(screen.getByLabelText('Details (optional)'), {
    target: { value: 'First account details' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^Request refund$/ }));
  return screen.findByRole('alertdialog');
}

beforeEach(() => {
  mocks.useSession.mockReturnValue(session());
  mocks.fetch.mockResolvedValue(response(data()));
  mocks.addCsrfHeaders.mockImplementation(async (headers: Record<string, string>) => ({
    ...headers,
    'X-CSRF-Token': 'unit-csrf-token',
  }));
  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('refund request session ownership', () => {
  it.each([
    { isLoaded: false, isSignedIn: false, userId: null },
    { isLoaded: false, isSignedIn: true, userId: FIRST_USER },
    { isLoaded: true, isSignedIn: false, userId: null },
    { isLoaded: true, isSignedIn: true, userId: null },
  ])('does not request refunds before a loaded account exists: %j', (state) => {
    mocks.useSession.mockReturnValue(session(state));
    render(<RefundRequestForm />);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Payment')).not.toBeInTheDocument();
    if (state.isLoaded) {
      expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
        'href',
        '/login?redirectTo=%2Frefund-policy%23request',
      );
    }
  });

  it('loads actual response data once identity becomes ready', async () => {
    mocks.useSession.mockReturnValue(session({ isLoaded: false }));
    const view = render(<RefundRequestForm />);
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.useSession.mockReturnValue(session());
    view.rerender(<RefundRequestForm />);
    expect(await screen.findByRole('option', { name: /Credit top-up/ })).toHaveValue(charge.id);
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(ENDPOINT, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
  });

  it('preserves the sign-in state when the server refuses an apparently signed-in session', async () => {
    mocks.fetch.mockResolvedValue(response({ error: 'Unauthorized' }, 401));
    render(<RefundRequestForm />);
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Payment')).not.toBeInTheDocument();
  });

  it.each([403, 500])('keeps HTTP %s visible as a load error', async (status) => {
    mocks.fetch.mockResolvedValue(response({ error: 'Refused' }, status));
    render(<RefundRequestForm />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your payments could not be loaded.',
    );
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('keeps transport failure visible', async () => {
    mocks.fetch.mockRejectedValue(new Error('offline'));
    render(<RefundRequestForm />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your payments could not be loaded.',
    );
  });

  it('does not reload or erase entered fields for the same account', async () => {
    const view = render(<RefundRequestForm />);
    fireEvent.change(await screen.findByLabelText('Payment'), { target: { value: charge.id } });
    fireEvent.change(screen.getByLabelText('Details (optional)'), { target: { value: 'Kept' } });
    mocks.useSession.mockReturnValue(session());
    view.rerender(<RefundRequestForm />);
    expect(screen.getByLabelText('Payment')).toHaveValue(charge.id);
    expect(screen.getByLabelText('Details (optional)')).toHaveValue('Kept');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('unmounts the old form, fields and confirmation immediately when the account changes', async () => {
    const next = deferredResponse();
    mocks.fetch.mockResolvedValueOnce(response(data())).mockReturnValueOnce(next.promise);
    const view = render(<RefundRequestForm />);
    await completeForm();
    mocks.useSession.mockReturnValue(session({ userId: SECOND_USER }));
    view.rerender(<RefundRequestForm />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Payment')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('First account details')).not.toBeInTheDocument();
    const secondCharge = { ...charge, id: 'ch_second_payment' };
    await act(async () => next.resolve(response(data([secondCharge]))));
    expect(await screen.findByLabelText('Payment')).toHaveValue('');
    expect(screen.getByLabelText('Reason')).toHaveValue('');
    expect(screen.getByLabelText('Details (optional)')).toHaveValue('');
    expect(screen.getByRole('option', { name: /Credit top-up/ })).toHaveValue(secondCharge.id);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('ignores an old load that completes after the next account has loaded', async () => {
    const old = deferredResponse();
    const secondCharge = { ...charge, id: 'ch_second_payment' };
    mocks.fetch
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(response(data([secondCharge])));
    const view = render(<RefundRequestForm />);
    mocks.useSession.mockReturnValue(session({ userId: SECOND_USER }));
    view.rerender(<RefundRequestForm />);
    await screen.findByLabelText('Payment');
    await act(async () => old.resolve(response(data([charge], [requested]))));
    expect(screen.getByRole('option', { name: /Credit top-up/ })).toHaveValue(secondCharge.id);
    expect(screen.queryByText('Your requests')).not.toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['signed out', 'loading'] as const)(
    'clears private state when identity becomes %s',
    async (state) => {
      mocks.fetch.mockResolvedValueOnce(
        response(data([charge], [{ ...requested, chargeId: 'ch_prior' }])),
      );
      const view = render(<RefundRequestForm />);
      await screen.findByText('Your requests');
      mocks.useSession.mockReturnValue(
        session({ isLoaded: state !== 'loading', isSignedIn: false, userId: null }),
      );
      view.rerender(<RefundRequestForm />);
      expect(screen.queryByText('Your requests')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Payment')).not.toBeInTheDocument();
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('cannot restore an old response after sign-out', async () => {
    const old = deferredResponse();
    mocks.fetch.mockReturnValueOnce(old.promise);
    const view = render(<RefundRequestForm />);
    mocks.useSession.mockReturnValue(session({ isSignedIn: false, userId: null }));
    view.rerender(<RefundRequestForm />);
    await act(async () => old.resolve(response(data([charge], [requested]))));
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText('Your requests')).not.toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('requires confirmation, preserves CSRF and reloads after a successful request', async () => {
    mocks.fetch
      .mockResolvedValueOnce(response(data()))
      .mockResolvedValueOnce(response({ request: requested }, 201))
      .mockResolvedValueOnce(response(data([], [requested])));
    render(<RefundRequestForm />);
    let dialog = await completeForm();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    dialog = await completeForm();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Request refund$/ }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(3));
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'unit-csrf-token' },
      body: JSON.stringify({
        chargeId: charge.id,
        reason: 'other',
        details: 'First account details',
      }),
    });
    expect(await screen.findByText('Your requests')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for a decision');
  });

  it('keeps a refused submission visible and permits an explicit retry', async () => {
    mocks.fetch
      .mockResolvedValueOnce(response(data()))
      .mockResolvedValueOnce(
        response({ error: { message: 'This payment is not on your account.' } }, 404),
      )
      .mockResolvedValueOnce(response({ request: requested }, 201))
      .mockResolvedValueOnce(response(data([], [requested])));
    render(<RefundRequestForm />);
    let dialog = await completeForm();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Request refund$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This payment is not on your account.',
    );
    dialog = await completeForm();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Request refund$/ }));
    await screen.findByText('Your requests');
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
  });

  it('does not publish or reload an old submitted request after the account changes', async () => {
    const old = deferredResponse();
    mocks.fetch
      .mockResolvedValueOnce(response(data()))
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(response(data([{ ...charge, id: 'ch_second_payment' }])));
    const view = render(<RefundRequestForm />);
    const dialog = await completeForm();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Request refund$/ }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    mocks.useSession.mockReturnValue(session({ userId: SECOND_USER }));
    view.rerender(<RefundRequestForm />);
    await screen.findByLabelText('Payment');
    const completed = response({ request: requested }, 201);
    const readBody = vi.spyOn(completed, 'json');
    await act(async () => old.resolve(completed));
    expect(screen.queryByText('Your requests')).not.toBeInTheDocument();
    expect(screen.queryByText('Waiting for a decision')).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Credit top-up/ })).toHaveValue('ch_second_payment');
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    expect(readBody).not.toHaveBeenCalled();
  });

  it('does not start an old confirmed mutation if sign-out happens while CSRF is pending', async () => {
    const headers = deferredResponse<Record<string, string>>();
    mocks.addCsrfHeaders.mockReturnValueOnce(headers.promise);
    const view = render(<RefundRequestForm />);
    const dialog = await completeForm();
    fireEvent.click(within(dialog).getByRole('button', { name: /^Request refund$/ }));
    await waitFor(() => expect(mocks.addCsrfHeaders).toHaveBeenCalledTimes(1));
    mocks.useSession.mockReturnValue(session({ isSignedIn: false, userId: null }));
    view.rerender(<RefundRequestForm />);
    await act(async () => headers.resolve({ 'X-CSRF-Token': 'unit-csrf-token' }));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });
});
