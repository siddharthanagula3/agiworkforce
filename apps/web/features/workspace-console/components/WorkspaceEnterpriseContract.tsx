'use client';

import { Spinner } from '@agiworkforce/ui';

import { useEnterpriseContract } from '../hooks/use-enterprise-contract';
import { toUserMessage } from '@/lib/user-error-message';
import type {
  EnterpriseContractContact,
  EnterpriseContractSummary,
  EnterpriseInvoiceSummary,
} from '@/lib/services/enterprise-billing-service';

const cardStyle = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elev)',
} as const;

const TAX_STATUS_LABELS: Record<EnterpriseContractSummary['taxExemptStatus'], string> = {
  none: 'Taxable',
  exempt: 'Tax exempt',
  reverse: 'Reverse charge',
};

const CADENCE_LABELS: Record<EnterpriseContractSummary['billingCadence'], string> = {
  annual: 'Annual',
  quarterly: 'Quarterly',
};

const NOT_ON_RECORD = 'Not on record';

function formatDate(iso: string | null): string {
  if (!iso) return NOT_ON_RECORD;
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatAmount(cents: number, currency: string): string {
  return (cents / 100).toLocaleString(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  });
}

function termLabel(contract: EnterpriseContractSummary): string {
  if (!contract.termStart && !contract.termEnd) return NOT_ON_RECORD;
  return `${formatDate(contract.termStart)} to ${formatDate(contract.termEnd)}`;
}

function paymentTermsLabel(days: number | null): string {
  if (days === null) return 'As stated on each invoice';
  return days === 0 ? 'Due on receipt' : `Net ${days}`;
}

function contactLabel(contact: EnterpriseContractContact | null): string {
  if (!contact) return NOT_ON_RECORD;
  return [contact.name, contact.email].filter(Boolean).join(', ');
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3.5">
      <span className="text-sm" style={{ color: 'var(--text-2)' }}>
        {label}
      </span>
      <span
        className="text-sm font-medium tabular-nums break-all text-right"
        style={{ color: 'var(--text-1)' }}
      >
        {value}
      </span>
    </div>
  );
}

function SectionHeading({ id, title, caption }: { id: string; title: string; caption?: string }) {
  return (
    <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--settings-border)' }}>
      <h2 id={id} className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
        {title}
      </h2>
      {caption ? (
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          {caption}
        </p>
      ) : null}
    </div>
  );
}

function InvoiceTable({ invoices }: { invoices: EnterpriseInvoiceSummary[] }) {
  if (invoices.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-xs" style={{ color: 'var(--text-3)' }}>
        No invoices have been issued on this contract yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: 'var(--text-3)' }}>
            <th className="px-5 py-2 font-medium">Invoice</th>
            <th className="px-5 py-2 font-medium">Period</th>
            <th className="px-5 py-2 font-medium">Due</th>
            <th className="px-5 py-2 font-medium">Status</th>
            <th className="px-5 py-2 text-right font-medium">Amount</th>
            <th className="px-5 py-2 text-right font-medium">
              <span className="sr-only">Links</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice, index) => (
            <tr
              key={invoice.invoiceNumber ?? `invoice-${index}`}
              style={{ borderTop: '1px solid var(--settings-border)' }}
            >
              <td className="px-5 py-2.5" style={{ color: 'var(--text-1)' }}>
                {invoice.invoiceNumber ?? 'Pending number'}
              </td>
              <td className="whitespace-nowrap px-5 py-2.5" style={{ color: 'var(--text-2)' }}>
                {formatDate(invoice.periodStart)} to {formatDate(invoice.periodEnd)}
              </td>
              <td className="whitespace-nowrap px-5 py-2.5" style={{ color: 'var(--text-2)' }}>
                {formatDate(invoice.dueAt)}
              </td>
              <td className="px-5 py-2.5 capitalize" style={{ color: 'var(--text-2)' }}>
                {invoice.status}
              </td>
              <td
                className="px-5 py-2.5 text-right tabular-nums"
                style={{ color: 'var(--text-1)' }}
              >
                {formatAmount(invoice.amountDueCents, invoice.currency)}
              </td>
              <td className="whitespace-nowrap px-5 py-2.5 text-right">
                {invoice.hostedInvoiceUrl ? (
                  <a
                    href={invoice.hostedInvoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{ color: 'var(--text-1)' }}
                  >
                    View
                  </a>
                ) : null}
                {invoice.invoicePdfUrl ? (
                  <a
                    href={invoice.invoicePdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-3 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{ color: 'var(--text-1)' }}
                  >
                    PDF
                  </a>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WorkspaceEnterpriseContract() {
  const { data, isPending, isError, error, refetch } = useEnterpriseContract();

  if (isPending) {
    return (
      <div
        className="flex items-center gap-2"
        style={{ ...cardStyle, padding: 20, color: 'var(--text-3)', fontSize: 13 }}
      >
        <Spinner size="sm" aria-label="Loading the enterprise contract" />
        Loading the enterprise contract…
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ ...cardStyle, padding: 20 }}>
        <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          We could not load the enterprise contract
        </p>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
          {toUserMessage(error, 'Could not load the enterprise contract.')}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-3 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
        >
          Try again
        </button>
      </div>
    );
  }

  const contract = data?.contract ?? null;
  if (!contract) return null;

  return (
    <div className="flex flex-col gap-6">
      <section style={cardStyle} aria-labelledby="enterprise-contract-heading">
        <SectionHeading
          id="enterprise-contract-heading"
          title={contract.ended ? 'Enterprise contract (ended)' : 'Enterprise contract'}
          caption="Read only. Your account team changes contract terms, and changes appear here once billing records them."
        />
        <div className="divide-y" style={{ borderColor: 'var(--settings-border)' }}>
          <Row label="Legal entity" value={contract.customerLegalEntity ?? NOT_ON_RECORD} />
          <Row label="Term" value={termLabel(contract)} />
          <Row label="Billing cadence" value={CADENCE_LABELS[contract.billingCadence]} />
          <Row label="Committed seats" value={String(contract.committedSeats)} />
          <Row label="Payment terms" value={paymentTermsLabel(contract.paymentTermsDays)} />
          <Row label="Tax status" value={TAX_STATUS_LABELS[contract.taxExemptStatus]} />
          <Row label="Purchase order" value={contract.procurementReference ?? NOT_ON_RECORD} />
          {contract.supportTier ? <Row label="Support tier" value={contract.supportTier} /> : null}
        </div>
      </section>

      <section style={cardStyle} aria-labelledby="enterprise-contacts-heading">
        <SectionHeading
          id="enterprise-contacts-heading"
          title="Contacts"
          caption="Who receives invoices and who approves purchases for this contract."
        />
        <div className="divide-y" style={{ borderColor: 'var(--settings-border)' }}>
          <Row label="Billing contact" value={contactLabel(contract.billingContact)} />
          <Row label="Procurement contact" value={contactLabel(contract.procurementContact)} />
        </div>
      </section>

      <section style={cardStyle} aria-labelledby="enterprise-invoices-heading">
        <SectionHeading
          id="enterprise-invoices-heading"
          title="Invoices"
          caption="The most recent invoices on this contract, newest first."
        />
        <InvoiceTable invoices={data?.invoices ?? []} />
      </section>
    </div>
  );
}
