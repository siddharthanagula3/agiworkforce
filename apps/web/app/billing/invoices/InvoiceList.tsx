'use client';

import { useEffect, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/billing/invoices', { credentials: 'include' });
        if (!response.ok) throw new Error(`Invoices could not be loaded (${response.status}).`);
        const body = (await response.json()) as { invoices?: Invoice[] };
        if (!cancelled) setState({ status: 'ready', invoices: body.invoices ?? [] });
      } catch (error) {
        if (cancelled) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Invoices could not be loaded.',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Spinner />
        Loading your invoices
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <p role="alert" className="py-6 text-sm text-destructive-text">
        {state.message} Your receipts are also available from the billing portal in Settings.
      </p>
    );
  }

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
          <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
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
            <th scope="col" className="whitespace-nowrap px-4 py-3 text-right font-semibold">
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
              <td className="whitespace-nowrap px-4 py-3 text-right">
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
                    className="ml-3 underline underline-offset-2"
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
