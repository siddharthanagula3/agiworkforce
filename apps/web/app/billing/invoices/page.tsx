import Link from 'next/link';

import { buildMetadata } from '@/lib/seo/metadata';
import { InvoiceList } from './InvoiceList';

export const metadata = buildMetadata({
  title: 'Invoices and receipts',
  description: 'Every invoice on your account, with the receipt for each one.',
  path: '/billing/invoices',
});

export default function BillingInvoicesPage() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Invoices and receipts</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Every invoice raised against your account, newest first. Each one links to its receipt and
        its PDF. Payment methods and the plan itself live in{' '}
        <Link href="/settings/billing" className="underline underline-offset-2">
          Settings, Billing
        </Link>
        .
      </p>
      <div className="mt-6">
        <InvoiceList />
      </div>
    </main>
  );
}
