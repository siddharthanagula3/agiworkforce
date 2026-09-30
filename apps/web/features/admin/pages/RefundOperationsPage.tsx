'use client';

import { useCallback, useEffect, useState } from 'react';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import {
  OPERATOR_REFUND_STRIPE_REASONS,
  REFUND_REQUEST_REASON_LABELS,
  formatPaymentAmount,
  paymentFractionDigits,
  type OperatorAccountBilling,
  type OperatorRefundRequestView,
  type OperatorRefundStripeReason,
  type RefundAssessment,
  type RefundableChargeView,
} from '@/lib/billing/refund-requests';
import { formatDateTime } from '../lib/operator-format';

const ENDPOINT = '/api/admin/billing-refunds';

const CARD_CLASS = 'rounded-2xl border border-border bg-card p-5';
const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-foreground/40';
const ACTION_CLASS =
  'rounded-full border border-border px-4 py-2 text-xs transition-colors hover:border-foreground/30 disabled:opacity-50';
const DESTRUCTIVE_CLASS =
  'rounded-full border border-destructive/50 px-4 py-2 text-xs font-medium text-danger transition-colors hover:bg-destructive/10 disabled:opacity-50';

const ASSESSMENT_LABEL: Record<RefundAssessment, string> = {
  statutory_withdrawal: 'Statutory withdrawal',
  unused_within_policy: 'Unused, inside the 7-day window',
  needs_review: 'Needs a decision',
};

const STRIPE_REASON_LABEL: Record<OperatorRefundStripeReason, string> = {
  requested_by_customer: 'Requested by the customer',
  duplicate: 'Duplicate charge',
  fraudulent: 'Fraudulent charge',
};

interface RefundTarget {
  charge: Pick<RefundableChargeView, 'id' | 'kind' | 'refundableCents' | 'currency'>;
  requestId: string | null;
  statutoryCents: number | null;
  minimumCents: number;
}

interface RefundOutcome {
  refundId: string;
  refundStatus: string | null;
  amountCents: number;
  currency: string;
  planEnded: boolean;
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'include', ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  return body as T;
}

function toMinorUnits(value: string, currency: string): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 10 ** paymentFractionDigits(currency));
}

function toMajorUnits(amount: number, currency: string): string {
  return (amount / 10 ** paymentFractionDigits(currency)).toString();
}

function requestTarget(request: OperatorRefundRequestView): RefundTarget {
  const statutory = request.assessment === 'statutory_withdrawal' || request.statutoryWithdrawal;
  return {
    charge: {
      id: request.chargeId,
      kind: request.chargeKind,
      refundableCents: request.chargeAmountCents,
      currency: request.chargeCurrency,
    },
    requestId: request.id,
    statutoryCents: statutory ? request.assessedRefundCents : null,
    minimumCents:
      request.assessment === 'statutory_withdrawal' ? (request.assessedRefundCents ?? 0) : 0,
  };
}

function chargeTarget(charge: RefundableChargeView): RefundTarget {
  return {
    charge,
    requestId: null,
    statutoryCents: charge.withdrawalEligible ? charge.withdrawalRefundCents : null,
    minimumCents: 0,
  };
}

function RequestRow({
  request,
  onRefund,
  onDecline,
}: {
  request: OperatorRefundRequestView;
  onRefund: (target: RefundTarget) => void;
  onDecline: (request: OperatorRefundRequestView) => void;
}) {
  return (
    <li className="flex flex-col gap-2 py-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 space-y-1 text-sm">
        <p className="text-foreground">
          {formatPaymentAmount(request.chargeAmountCents, request.chargeCurrency)}{' '}
          {request.chargeKind === 'plan' ? 'plan payment' : 'credit top-up'} on{' '}
          {formatDateTime(request.chargeCreatedAt)}
        </p>
        <p className="text-xs text-muted-foreground">
          {REFUND_REQUEST_REASON_LABELS[request.reason]} · {ASSESSMENT_LABEL[request.assessment]}
          {request.assessedRefundCents !== null
            ? ` · assessed ${formatPaymentAmount(request.assessedRefundCents, request.chargeCurrency)}`
            : ''}
          {request.billingCountry ? ` · billed in ${request.billingCountry}` : ''} · asked{' '}
          {formatDateTime(request.createdAt)}
        </p>
        {request.details ? (
          <p className="break-words text-xs text-muted-foreground">“{request.details}”</p>
        ) : null}
        <p className="font-mono text-xs text-muted-foreground">
          {request.userId} · {request.chargeId}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          className={ACTION_CLASS}
          onClick={() => onRefund(requestTarget(request))}
        >
          Refund
        </button>
        <button type="button" className={ACTION_CLASS} onClick={() => onDecline(request)}>
          Decline
        </button>
      </div>
    </li>
  );
}

export default function RefundOperationsPage() {
  const { confirm, dialog } = useConfirmAction();
  const [pending, setPending] = useState<OperatorRefundRequestView[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [query, setQuery] = useState('');
  const [account, setAccount] = useState<OperatorAccountBilling | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [target, setTarget] = useState<RefundTarget | null>(null);
  const [refundKey, setRefundKey] = useState('');
  const [amount, setAmount] = useState('');
  const [stripeReason, setStripeReason] =
    useState<OperatorRefundStripeReason>('requested_by_customer');
  const [note, setNote] = useState('');
  const [endPlan, setEndPlan] = useState(true);
  const [declining, setDeclining] = useState<OperatorRefundRequestView | null>(null);
  const [declineNote, setDeclineNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const body = await readJson<{ pending: OperatorRefundRequestView[] }>(ENDPOINT);
      setPending(body.pending);
    } catch (loadError) {
      setError(toUserMessage(loadError, 'The refund queue could not be loaded.'));
    } finally {
      setLoadingPending(false);
    }
  }, []);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  async function lookUp(search = query) {
    const candidate = search.trim();
    if (!candidate) {
      setError('Enter an email, account id, customer id, payment intent id or charge id.');
      return;
    }
    setLookingUp(true);
    setError(null);
    try {
      const body = await readJson<{ account: OperatorAccountBilling }>(
        `${ENDPOINT}?q=${encodeURIComponent(candidate)}`,
      );
      setAccount(body.account);
    } catch (lookupError) {
      setAccount(null);
      setError(toUserMessage(lookupError, 'No account matches that lookup.'));
    } finally {
      setLookingUp(false);
    }
  }

  function openRefund(next: RefundTarget) {
    setTarget(next);
    setRefundKey(crypto.randomUUID());
    setAmount(
      toMajorUnits(
        next.requestId !== null && next.statutoryCents !== null && next.statutoryCents > 0
          ? Math.min(next.statutoryCents, next.charge.refundableCents)
          : next.charge.refundableCents,
        next.charge.currency,
      ),
    );
    setStripeReason('requested_by_customer');
    setNote('');
    setEndPlan(next.charge.kind === 'plan');
    setNotice(null);
    setError(null);
  }

  async function post<T>(payload: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
    return readJson<T>(ENDPOINT, {
      method: 'POST',
      headers: await addCsrfHeaders({
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': `agi.refund.admin.${idempotencyKey}` } : {}),
      }),
      body: JSON.stringify(payload),
    });
  }

  function submitRefund() {
    if (!target) return;
    const recordedNote = note.trim();
    const amountCents = toMinorUnits(amount, target.charge.currency);
    if (!recordedNote) {
      setError('A reason is required; it is written to the audit log with your account.');
      return;
    }
    if (amountCents === null || amountCents > target.charge.refundableCents) {
      setError(
        `Enter an amount up to ${formatPaymentAmount(target.charge.refundableCents, target.charge.currency)}.`,
      );
      return;
    }
    if (amountCents < Math.min(target.minimumCents, target.charge.refundableCents)) {
      setError(
        `This is a statutory withdrawal, so refund at least ${formatPaymentAmount(target.minimumCents, target.charge.currency)}.`,
      );
      return;
    }
    const ending = target.charge.kind === 'plan' && endPlan;
    confirm({
      title: `Refund ${formatPaymentAmount(amountCents, target.charge.currency)}?`,
      description:
        `Stripe sends ${formatPaymentAmount(amountCents, target.charge.currency)} back to the card that paid, and it cannot be taken back. ` +
        (target.charge.kind === 'top_up'
          ? 'The credits bought with this payment are removed in proportion when Stripe confirms. '
          : 'The plan credits for the current period are removed in proportion when Stripe confirms. ') +
        (ending
          ? 'The subscription is canceled now, so the customer loses the plan today and is not billed again. '
          : '') +
        'Your account, the reason and the time are written to the audit log.',
      confirmLabel: 'Refund',
      onConfirm: async () => {
        setError(null);
        try {
          const outcome = await post<RefundOutcome>(
            {
              action: 'refund',
              chargeId: target.charge.id,
              amountCents: amountCents === target.charge.refundableCents ? null : amountCents,
              note: recordedNote,
              stripeReason,
              requestId: target.requestId,
              endPlan: ending,
            },
            refundKey,
          );
          setNotice(
            `Refund ${outcome.refundId} for ${formatPaymentAmount(outcome.amountCents, outcome.currency)} is ${outcome.refundStatus ?? 'submitted'}${outcome.planEnded ? ', and the subscription is canceled' : ''}.`,
          );
          setTarget(null);
          await loadPending();
          if (account) await lookUp(account.userId);
        } catch (refundError) {
          setError(toUserMessage(refundError, 'The refund was not issued.'));
        }
      },
    });
  }

  function submitDecline() {
    if (!declining) return;
    const recordedNote = declineNote.trim();
    if (!recordedNote) {
      setError('Say why. The customer sees this reason in their notification.');
      return;
    }
    const request = declining;
    confirm({
      title: 'Decline this refund request?',
      description:
        'The customer is told the request was declined, with your reason. No money moves. They can still write to support, and a statutory right the law gives them is not affected by this decision.',
      confirmLabel: 'Decline',
      onConfirm: async () => {
        setError(null);
        try {
          await post({ action: 'decline', requestId: request.id, note: recordedNote });
          setNotice('The request was declined and the customer was told why.');
          setDeclining(null);
          setDeclineNote('');
          await loadPending();
          if (account) await lookUp(account.userId);
        } catch (declineError) {
          setError(toUserMessage(declineError, 'The request was not declined.'));
        }
      },
    });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
        <header>
          <h1 className="text-h1 text-foreground">Refunds and disputes</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Refund a payment in full or in part through Stripe, and decide the refund requests
            customers filed. Every refund and decline is written to the security audit log. The plan
            and credits follow from the Stripe refund event, not from this page.
          </p>
        </header>

        {dialog}

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="text-sm text-foreground">
            {notice}
          </p>
        ) : null}

        <section className="flex flex-col gap-3" aria-labelledby="refund-queue-title">
          <h2 id="refund-queue-title" className="text-h5">
            Requests waiting for a decision
          </h2>
          <div className={CARD_CLASS}>
            {loadingPending ? (
              <div className="flex items-center gap-3">
                <Spinner size="sm" />
                <span className="text-sm text-muted-foreground">Loading the queue…</span>
              </div>
            ) : pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">No refund request is waiting.</p>
            ) : (
              <ul className="divide-y divide-border">
                {pending.map((request) => (
                  <RequestRow
                    key={request.id}
                    request={request}
                    onRefund={openRefund}
                    onDecline={(next) => {
                      setDeclining(next);
                      setDeclineNote('');
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        {declining ? (
          <section className={CARD_CLASS} aria-labelledby="refund-decline-title">
            <h2 id="refund-decline-title" className="text-h5">
              Decline the request for {declining.chargeId}
            </h2>
            <label className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
              Reason, sent to the customer
              <textarea
                value={declineNote}
                onChange={(event) => setDeclineNote(event.target.value)}
                maxLength={1000}
                rows={3}
                className={FIELD_CLASS}
              />
            </label>
            <div className="mt-3 flex gap-2">
              <button type="button" className={DESTRUCTIVE_CLASS} onClick={submitDecline}>
                Decline
              </button>
              <button type="button" className={ACTION_CLASS} onClick={() => setDeclining(null)}>
                Cancel
              </button>
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-3" aria-labelledby="refund-lookup-title">
          <h2 id="refund-lookup-title" className="text-h5">
            Find an account
          </h2>
          <div className={CARD_CLASS}>
            <form
              className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                void lookUp();
              }}
            >
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Email, account id, customer id, payment intent id or charge id
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className={FIELD_CLASS}
                />
              </label>
              <button type="submit" disabled={lookingUp} className={ACTION_CLASS}>
                {lookingUp ? 'Looking up…' : 'Look up'}
              </button>
            </form>

            {account ? (
              <div className="mt-4 space-y-4 border-t border-border pt-4">
                <dl className="grid gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Email</dt>
                    <dd className="mt-1 break-words">{account.email ?? 'none'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Account</dt>
                    <dd className="mt-1 break-words font-mono text-xs">{account.userId}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Plan</dt>
                    <dd className="mt-1">
                      {account.planTier ?? 'none'} · {account.subscriptionStatus ?? 'no status'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Stripe customer</dt>
                    <dd className="mt-1 break-words font-mono text-xs">
                      {account.stripeCustomerId ?? 'none'}
                    </dd>
                  </div>
                </dl>

                <div>
                  <h3 className="text-xs font-medium text-muted-foreground">Payments</h3>
                  {account.charges.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">No completed payments.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-border">
                      {account.charges.map((charge) => (
                        <li
                          key={charge.id}
                          className="flex flex-col gap-2 py-2 text-sm md:flex-row md:items-center md:justify-between"
                        >
                          <span>
                            {formatPaymentAmount(charge.amountCents, charge.currency)}{' '}
                            {charge.kind === 'plan' ? 'plan payment' : 'credit top-up'} on{' '}
                            {formatDateTime(charge.createdAt)}
                            {charge.refundedCents > 0
                              ? ` · ${formatPaymentAmount(charge.refundedCents, charge.currency)} refunded`
                              : ''}
                            {charge.disputed ? ' · disputed' : ''}
                            {charge.withdrawalEligible
                              ? charge.withdrawalRefundCents !== null
                                ? ` · 14-day withdrawal refund ${formatPaymentAmount(charge.withdrawalRefundCents, charge.currency)}${charge.withdrawalProrated ? ', prorated by use' : ', in full: no consent to immediate access'}`
                                : ' · inside the 14-day withdrawal window'
                              : ''}
                            <span className="ms-2 font-mono text-xs text-muted-foreground">
                              {charge.id}
                            </span>
                          </span>
                          <button
                            type="button"
                            className={ACTION_CLASS}
                            disabled={charge.refundableCents <= 0 || charge.disputed}
                            onClick={() => openRefund(chargeTarget(charge))}
                          >
                            Refund
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {account.disputes.length > 0 ? (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground">Disputes</h3>
                    <ul className="mt-2 divide-y divide-border">
                      {account.disputes.map((dispute) => (
                        <li key={dispute.id} className="py-2 text-sm">
                          {formatPaymentAmount(dispute.amountCents, dispute.currency)} ·{' '}
                          {dispute.outcome} ({dispute.stripeStatus}) · opened{' '}
                          {formatDateTime(dispute.openedAt)}
                          {dispute.restoredAt
                            ? ` · restored ${formatDateTime(dispute.restoredAt)}`
                            : ''}
                          <span className="ms-2 font-mono text-xs text-muted-foreground">
                            {dispute.id}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {account.requests.length > 0 ? (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground">Refund requests</h3>
                    <ul className="mt-2 divide-y divide-border">
                      {account.requests.map((request) => (
                        <li key={request.id} className="py-2 text-sm">
                          {request.chargeId} · {REFUND_REQUEST_REASON_LABELS[request.reason]} ·{' '}
                          {request.status}
                          {request.refundAmountCents !== null
                            ? ` · ${formatPaymentAmount(request.refundAmountCents, request.chargeCurrency)}`
                            : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        {target ? (
          <section className={CARD_CLASS} aria-labelledby="refund-form-title">
            <h2 id="refund-form-title" className="text-h5">
              Refund {target.charge.id}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Up to {formatPaymentAmount(target.charge.refundableCents, target.charge.currency)} can
              still be refunded.
              {target.statutoryCents !== null
                ? ` An EU, EEA or UK customer withdrawing within 14 days is owed ${formatPaymentAmount(target.statutoryCents, target.charge.currency)}: prorated by the credits used when they asked for immediate access at purchase, the whole payment otherwise.`
                : ''}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Amount ({target.charge.currency.toUpperCase()})
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  className={FIELD_CLASS}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Reason Stripe records
                <select
                  value={stripeReason}
                  onChange={(event) =>
                    setStripeReason(event.target.value as OperatorRefundStripeReason)
                  }
                  className={FIELD_CLASS}
                >
                  {OPERATOR_REFUND_STRIPE_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {STRIPE_REASON_LABEL[reason]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
                Reason, recorded on the audit entry
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={1000}
                  className={FIELD_CLASS}
                />
              </label>
              {target.charge.kind === 'plan' ? (
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={endPlan}
                    onChange={(event) => setEndPlan(event.target.checked)}
                  />
                  Cancel the subscription now, so it is not billed again
                </label>
              ) : null}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className={DESTRUCTIVE_CLASS} onClick={submitRefund}>
                Refund
              </button>
              <button type="button" className={ACTION_CLASS} onClick={() => setTarget(null)}>
                Cancel
              </button>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
