'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@agiworkforce/ui';
import { formatCredits } from '@agiworkforce/types';
import { toUserMessage } from '@/lib/user-error-message';
import type {
  BillingRefund,
  RefundStatus,
  TopUpReceipt,
  TopUpReceiptStatus,
} from '../lib/billing-account-types';
import { formatBillingDate, formatBillingMoney } from '../lib/billing-format';
import { fetchRefunds, fetchTopUpReceipts } from '../services/billing-account';

type HistoryState =
  | { status: 'loading' }
  | { status: 'ready'; receipts: TopUpReceipt[]; refunds: BillingRefund[] }
  | { status: 'error'; message: string };

const RECEIPT_STATUS_LABEL: Readonly<Record<TopUpReceiptStatus, string>> = {
  paid: 'Paid',
  processing: 'Processing',
  refunded: 'Refunded',
  partially_refunded: 'Partly refunded',
};

const REFUND_STATUS_LABEL: Readonly<Record<RefundStatus, string>> = {
  processing: 'Processing',
  action_required: 'Action needed',
  refunded: 'Refunded',
  failed: 'Failed',
  canceled: 'Canceled',
};

const REFUND_STATUS_CLASS: Readonly<Record<RefundStatus, string>> = {
  processing: 'text-warning-text',
  action_required: 'text-warning-text',
  refunded: 'text-success-text',
  failed: 'text-destructive-text',
  canceled: 'text-muted-foreground',
};

const HEADER_CELL =
  'whitespace-nowrap px-3 py-2 text-start text-xs font-medium text-muted-foreground';
const CELL = 'whitespace-nowrap px-3 py-2.5';

function refundSubject(refund: BillingRefund): string {
  if (refund.kind === 'plan') return 'Plan payment';
  return refund.credits ? `Credit pack, ${formatCredits(refund.credits)}` : 'Credit pack';
}

export function BillingPaymentHistory({ refreshKey }: { refreshKey: number }) {
  const [state, setState] = useState<HistoryState>({ status: 'loading' });

  const load = useCallback(async (isCancelled: () => boolean) => {
    setState({ status: 'loading' });
    try {
      const [receipts, refunds] = await Promise.all([fetchTopUpReceipts(), fetchRefunds()]);
      if (!isCancelled()) setState({ status: 'ready', receipts, refunds });
    } catch (cause) {
      if (!isCancelled()) {
        setState({
          status: 'error',
          message: toUserMessage(cause, 'Your credit purchases could not be loaded.'),
        });
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load, refreshKey]);

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="credit-purchases-title" className="flex flex-col gap-2">
        <h2
          id="credit-purchases-title"
          className="text-[13px] font-semibold text-[color:var(--text-2)]"
        >
          Credit purchases
        </h2>
        {state.status === 'loading' ? (
          <p role="status" className="text-[13px] text-muted-foreground">
            Loading credit purchases…
          </p>
        ) : state.status === 'error' ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-[13px]">
            <span className="text-destructive-text">{state.message}</span>
            <Button
              size="sm"
              variant="outline"
              className="pointer-coarse:h-11"
              onClick={() => void load(() => false)}
            >
              Try again
            </Button>
          </div>
        ) : state.receipts.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            No credit purchases yet. Each one you make gets a receipt here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <caption className="sr-only">Credit purchases, newest first</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className={HEADER_CELL}>
                    Date
                  </th>
                  <th scope="col" className={HEADER_CELL}>
                    Credits
                  </th>
                  <th scope="col" className={HEADER_CELL}>
                    Paid
                  </th>
                  <th scope="col" className={HEADER_CELL}>
                    Status
                  </th>
                  <th scope="col" className={`${HEADER_CELL} text-end`}>
                    Receipt
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.receipts.map((receipt) => (
                  <tr key={receipt.id} className="border-b border-border last:border-b-0">
                    <td className={CELL}>{formatBillingDate(receipt.createdAt)}</td>
                    <td className={CELL}>
                      {receipt.credits ? formatCredits(receipt.credits) : 'Credit pack'}
                      {receipt.autoReload ? (
                        <span className="ms-2 text-xs text-muted-foreground">Auto-reload</span>
                      ) : null}
                    </td>
                    <td className={`${CELL} tabular-nums`}>
                      {formatBillingMoney(receipt.amountCents, receipt.currency)}
                    </td>
                    <td className={`${CELL} text-muted-foreground`}>
                      {RECEIPT_STATUS_LABEL[receipt.status]}
                    </td>
                    <td className={`${CELL} text-end`}>
                      {receipt.receiptUrl ? (
                        <a
                          href={receipt.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2"
                        >
                          View receipt
                        </a>
                      ) : (
                        <span className="text-muted-foreground">Not issued yet</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {state.status === 'ready' && state.refunds.length > 0 ? (
        <section aria-labelledby="refunds-title" className="flex flex-col gap-2">
          <h2 id="refunds-title" className="text-[13px] font-semibold text-[color:var(--text-2)]">
            Refunds
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <caption className="sr-only">Refunds, newest first</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className={HEADER_CELL}>
                    Requested
                  </th>
                  <th scope="col" className={HEADER_CELL}>
                    For
                  </th>
                  <th scope="col" className={HEADER_CELL}>
                    Amount
                  </th>
                  <th scope="col" className={HEADER_CELL}>
                    Status
                  </th>
                  <th scope="col" className={`${HEADER_CELL} text-end`}>
                    Receipt
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.refunds.map((refund) => (
                  <tr key={refund.id} className="border-b border-border last:border-b-0">
                    <td className={CELL}>{formatBillingDate(refund.createdAt)}</td>
                    <td className={CELL}>
                      {refundSubject(refund)}
                      <span className="block text-xs text-muted-foreground">
                        Paid {formatBillingDate(refund.paymentCreatedAt)}
                      </span>
                    </td>
                    <td className={`${CELL} tabular-nums`}>
                      {formatBillingMoney(refund.amountCents, refund.currency)}
                    </td>
                    <td className={`${CELL} ${REFUND_STATUS_CLASS[refund.status]}`}>
                      {REFUND_STATUS_LABEL[refund.status]}
                    </td>
                    <td className={`${CELL} text-end`}>
                      {refund.receiptUrl ? (
                        <a
                          href={refund.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2"
                        >
                          View
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
