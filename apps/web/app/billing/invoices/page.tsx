import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

import { buildMetadata } from '@/lib/seo/metadata';
import { BillingPaymentHistory } from '@features/billing/components/BillingPaymentHistory';
import { InvoiceList } from './InvoiceList';

export const metadata = buildMetadata({
  title: 'Invoices and receipts',
  description: 'Your recent invoices and credit purchases, with the receipt for each one.',
  path: '/billing/invoices',
});

export default function BillingInvoicesPage() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl px-4 py-10 max-md:pt-0">
      <div className="-ms-3 flex h-12 items-center md:hidden">
        <Link
          href="/settings/billing"
          className="inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm font-medium text-foreground"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          Back to billing
        </Link>
      </div>
      <h1 className="text-h1 max-md:mt-2">Invoices and receipts</h1>
      <p className="mt-2 text-xs text-muted-foreground">
        Your most recent card-billed invoices, newest first, with each receipt and PDF. Store and
        organization invoices are not listed here. Credit purchases are paid once and each has its
        own receipt below. Payment methods and the plan itself live in{' '}
        <Link href="/settings/billing" className="underline underline-offset-2">
          Settings, Billing
        </Link>
        .
      </p>
      <div className="mt-6">
        <InvoiceList />
      </div>
      <div className="mt-10">
        <BillingPaymentHistory refreshKey={0} />
      </div>
    </main>
  );
}
