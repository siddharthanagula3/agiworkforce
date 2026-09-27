'use client';

import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';

import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import {
  BILLING_ERROR_REASONS,
  REFUND_REQUEST_REASONS,
  REFUND_REQUEST_REASON_LABELS,
  formatPaymentAmount,
  type RefundRequestReason,
  type RefundRequestStatus,
  type RefundRequestView,
  type RefundRequestsResponse,
  type RefundableChargeView,
} from '@/lib/billing/refund-requests';

const ENDPOINT = '/api/billing/refund-requests';
const SIGN_IN_HREF = '/login?redirectTo=%2Frefund-policy%23request';

const STATUS_TEXT: Record<RefundRequestStatus, string> = {
  pending: 'Waiting for a decision',
  refunded: 'Refunded',
  declined: 'Declined',
};

type LoadState = 'loading' | 'signed_out' | 'ready' | 'error';

function paymentLabel(charge: RefundableChargeView): string {
  const date = new Date(charge.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' });
  const kind = charge.kind === 'plan' ? 'Plan payment' : 'Credit top-up';
  return `${kind}, ${formatPaymentAmount(charge.amountCents, charge.currency)}, ${date}`;
}

function withdrawalRefund(
  charge: RefundableChargeView,
  reason: RefundRequestReason,
): number | null {
  if (!charge.withdrawalEligible || BILLING_ERROR_REASONS.has(reason)) return null;
  return charge.withdrawalRefundCents !== null && charge.withdrawalRefundCents > 0
    ? charge.withdrawalRefundCents
    : null;
}

function consequence(charge: RefundableChargeView, reason: RefundRequestReason): string {
  const withdrawal = withdrawalRefund(charge, reason);
  if (withdrawal !== null) {
    const effect =
      charge.kind === 'plan'
        ? 'Your plan ends today and its remaining credits for this period are removed.'
        : 'The credits from this payment that you have not spent leave your balance.';
    return `You are within 14 days of this payment, so as soon as you confirm you get back ${formatPaymentAmount(withdrawal, charge.currency)}, the part of the payment for the credits you have not used. ${effect} A refund cannot be undone.`;
  }
  const effect =
    charge.kind === 'plan'
      ? 'your plan ends today and its credits for this period are removed'
      : 'the credits this payment bought are removed from your balance';
  return `If this payment qualifies under the policy above, it is refunded as soon as you confirm, and ${effect}. A refund cannot be undone. If it needs a person to decide, it waits and nothing changes until then.`;
}

function withdrawalHint(charge: RefundableChargeView): string | null {
  if (!charge.withdrawalEligible || charge.withdrawalRefundCents === null) return null;
  if (charge.withdrawalRefundCents > 0) {
    return `You are within 14 days of this payment. Withdrawing refunds ${formatPaymentAmount(charge.withdrawalRefundCents, charge.currency)}, prorated by the credits you have used.`;
  }
  return 'You have used the credits this payment bought, so a refund prorated by use comes to nothing. A person can still review the request.';
}

function outcomeText(request: RefundRequestView): string {
  if (request.status === 'refunded') {
    const amount =
      request.refundAmountCents === null
        ? ''
        : ` ${formatPaymentAmount(request.refundAmountCents, request.chargeCurrency)}`;
    return `Refunded${amount} to the card you paid with. Your bank usually shows it within 5 to 10 business days.`;
  }
  if (request.status === 'declined') {
    return request.decisionNote ? `Declined: ${request.decisionNote}` : 'Declined.';
  }
  return 'Waiting for a person to decide. You will get a notification with the answer.';
}

export function RefundRequestForm() {
  const chargeId = useId();
  const reasonId = useId();
  const detailsId = useId();
  const { confirm, dialog } = useConfirmAction();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [data, setData] = useState<RefundRequestsResponse>({ requests: [], charges: [] });
  const [selectedCharge, setSelectedCharge] = useState('');
  const [reason, setReason] = useState<RefundRequestReason | ''>('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RefundRequestView | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(ENDPOINT, { credentials: 'same-origin', cache: 'no-store' });
      if (response.status === 401) {
        setLoadState('signed_out');
        return;
      }
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      setData((await response.json()) as RefundRequestsResponse);
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const requested = new Set(data.requests.map((request) => request.chargeId));
  const eligible = data.charges.filter(
    (charge) => charge.refundableCents > 0 && !charge.disputed && !requested.has(charge.id),
  );
  const charge = eligible.find((candidate) => candidate.id === selectedCharge) ?? null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!charge || !reason) {
      setError('Choose the payment and the reason.');
      return;
    }
    setError(null);
    confirm({
      title: 'Request this refund?',
      description: consequence(charge, reason),
      confirmLabel: 'Request refund',
      onConfirm: async () => {
        try {
          const response = await fetch(ENDPOINT, {
            method: 'POST',
            credentials: 'same-origin',
            headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              chargeId: charge.id,
              reason,
              ...(details.trim() ? { details: details.trim() } : {}),
            }),
          });
          const body = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
          }
          setResult((body as { request: RefundRequestView }).request);
          setSelectedCharge('');
          setReason('');
          setDetails('');
          await load();
        } catch (submitError) {
          setError(
            toUserMessage(submitError, 'Your request was not recorded. Try again, or email us.'),
          );
        }
      },
    });
  }

  if (loadState === 'loading') {
    return (
      <div className="agi-ds-stack" data-gap="tight">
        <Spinner size="sm" />
      </div>
    );
  }

  if (loadState === 'signed_out') {
    return (
      <p className="agi-ds-prose" data-size="sm">
        <Link href={SIGN_IN_HREF} className="agi-ds-link">
          Sign in
        </Link>{' '}
        to choose a payment and request its refund here.
      </p>
    );
  }

  if (loadState === 'error') {
    return (
      <p role="alert" className="agi-ds-form-error">
        Your payments could not be loaded. Reload the page, or email us.
      </p>
    );
  }

  return (
    <div className="agi-ds-stack" data-gap="loose">
      {dialog}
      {result ? (
        <div className="agi-ds-stack" data-gap="tight" role="status">
          <h3 className="agi-ds-h3">{STATUS_TEXT[result.status]}</h3>
          <p className="agi-ds-prose" data-size="sm">
            {outcomeText(result)}
          </p>
        </div>
      ) : null}

      {eligible.length === 0 ? (
        <p className="agi-ds-prose" data-size="sm">
          There is no payment on this account that can still be refunded.
        </p>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="agi-ds-form">
          <div className="agi-ds-field">
            <label htmlFor={chargeId} className="agi-ds-field-label">
              Payment
            </label>
            <select
              id={chargeId}
              value={selectedCharge}
              className="agi-ds-input"
              onChange={(event) => setSelectedCharge(event.target.value)}
            >
              <option value="">Choose a payment…</option>
              {eligible.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {paymentLabel(candidate)}
                </option>
              ))}
            </select>
            {charge && withdrawalHint(charge) ? (
              <p className="agi-ds-hint">{withdrawalHint(charge)}</p>
            ) : null}
          </div>

          <div className="agi-ds-field">
            <label htmlFor={reasonId} className="agi-ds-field-label">
              Reason
            </label>
            <select
              id={reasonId}
              value={reason}
              className="agi-ds-input"
              onChange={(event) => setReason(event.target.value as RefundRequestReason | '')}
            >
              <option value="">Choose a reason…</option>
              {REFUND_REQUEST_REASONS.map((value) => (
                <option key={value} value={value}>
                  {REFUND_REQUEST_REASON_LABELS[value]}
                </option>
              ))}
            </select>
            {reason === 'statutory_withdrawal' && charge && !charge.withdrawalEligible ? (
              <p className="agi-ds-hint">
                This payment is more than 14 days old or was not billed to an address in the EU, EEA
                or UK, so a person reviews the request.
              </p>
            ) : null}
          </div>

          <div className="agi-ds-field">
            <label htmlFor={detailsId} className="agi-ds-field-label">
              Details (optional)
            </label>
            <textarea
              id={detailsId}
              rows={4}
              maxLength={2000}
              value={details}
              className="agi-ds-input"
              onChange={(event) => setDetails(event.target.value)}
            />
          </div>

          {error ? (
            <p role="alert" className="agi-ds-form-error">
              {error}
            </p>
          ) : null}

          <div className="agi-ds-btn-row">
            <button type="submit" className="agi-ds-btn" data-variant="primary">
              Request refund
            </button>
          </div>
        </form>
      )}

      {data.requests.length > 0 ? (
        <div className="agi-ds-stack" data-gap="tight">
          <h3 className="agi-ds-h3">Your requests</h3>
          <ul className="agi-ds-prose" data-size="sm">
            {data.requests.map((request) => (
              <li key={request.id}>
                {formatPaymentAmount(request.chargeAmountCents, request.chargeCurrency)}{' '}
                {request.chargeKind === 'plan' ? 'plan payment' : 'credit top-up'}:{' '}
                {outcomeText(request)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
