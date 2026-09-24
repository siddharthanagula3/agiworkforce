'use client';

import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';

interface Invoice {
  id: string;
  number: string;
  status: string;
  amount: number;
  currency: string;
  created_at: string;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}

type ListState =
  | { status: 'loading' }
  | { status: 'ready'; invoices: Invoice[] }
  | { status: 'error'; message: string };

const MINOR_UNITS_PER_UNIT = 100;

function formatAmount(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(minorUnits / MINOR_UNITS_PER_UNIT);
}

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString() : iso;
}

export function InvoiceList() {
  const [state, setState] = useState<ListState>({ status: 'loading' });

  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ status: 'loading' });
    try {
      const response = await fetch('/api/billing/invoices', { credentials: 'include', signal });
      if (!response.ok) {
        throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
      }
      const body = (await response.json()) as { invoices?: Invoice[] };
      setState({ status: 'ready', invoices: body.invoices ?? [] });
    } catch (error) {
      if (signal?.aborted) return;
      setState({
        status: 'error',
        message: toUserMessage(error, 'Invoices could not be loaded.'),
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const loadError = state.status === 'error' ? state.message : null;

  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Spinner />
        Loading your invoices
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="py-6 text-sm">
        <p className="text-destructive-text">
          {loadError} Your receipts are also available from the billing portal in Settings.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Try again
        </button>
      </div>
    );
  }

  if (state.status !== 'ready') return null;

  if (state.invoices.length === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        No invoices yet. A paid plan or a credit purchase produces one, and it appears here.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Your invoices, newest first</caption>
        <thead>
          <tr className="border-b border-border text-start text-xs uppercase tracking-wider text-muted-foreground">
            <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">
              Date
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">
              Invoice
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">
              Total
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">
              Status
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-3 text-end font-semibold">
              Receipt
            </th>
          </tr>
        </thead>
        <tbody>
          {state.invoices.map((invoice) => (
            <tr key={invoice.id} className="border-b border-border last:border-b-0">
              <td className="whitespace-nowrap px-4 py-3">{formatDate(invoice.created_at)}</td>
              <td className="whitespace-nowrap px-4 py-3 font-mono text-muted-foreground">
                {invoice.number || invoice.id}
              </td>
              <td className="whitespace-nowrap px-4 py-3 font-mono">
                {formatAmount(invoice.amount, invoice.currency)}
              </td>
              <td className="px-4 py-3 capitalize text-muted-foreground">{invoice.status}</td>
              <td className="whitespace-nowrap px-4 py-3 text-end">
                {invoice.hosted_invoice_url ? (
                  <a
                    href={invoice.hosted_invoice_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    View
                  </a>
                ) : null}
                {invoice.invoice_pdf ? (
                  <a
                    href={invoice.invoice_pdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ms-3 underline underline-offset-2"
                  >
                    PDF
                  </a>
                ) : null}
                {!invoice.hosted_invoice_url && !invoice.invoice_pdf ? (
                  <span className="text-muted-foreground">Not issued yet</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
