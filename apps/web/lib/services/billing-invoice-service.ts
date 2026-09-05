import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import type { SubscriptionRow } from '@/lib/server/neon-types';
import { getStripeClientOrNull } from '@/lib/server/stripe-client';

export interface BillingInvoiceRecord {
  id: string;
  number: string;
  status: string;
  amount: number;
  currency: string;
  description: string;
  created_at: string;
  due_date: string | null;
  paid_at: string | null;
  invoice_pdf: string | null;
  hosted_invoice_url: string | null;
  line_items: Array<{
    id: string;
    description: string;
    amount: number;
    quantity: number;
    period: { start: string; end: string };
  }>;
}

const stripe = getStripeClientOrNull();

export async function listUserBillingInvoices(userId: string): Promise<BillingInvoiceRecord[]> {
  if (!stripe) return [];

  type CustomerRow = Pick<SubscriptionRow, 'stripe_customer_id'>;
  const [subscription] = await getNeonDb()
    .query<CustomerRow>(
      `select stripe_customer_id
       from public.subscriptions
       where user_id = $1
       limit 1`,
      [userId],
    )
    .catch(() => [] as CustomerRow[]);

  if (!subscription?.stripe_customer_id) return [];

  const stripeInvoices = await stripe.invoices.list({
    customer: subscription.stripe_customer_id,
    limit: 24,
  });

  return stripeInvoices.data.map((invoice) => ({
    id: invoice.id,
    number: invoice.number ?? '',
    status: invoice.status ?? 'draft',
    amount: invoice.amount_due,
    currency: invoice.currency,
    description: invoice.description ?? `Invoice ${invoice.number ?? invoice.id}`,
    created_at: new Date(invoice.created * 1000).toISOString(),
    due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
    paid_at: invoice.status_transitions?.paid_at
      ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
      : null,
    invoice_pdf: invoice.invoice_pdf ?? null,
    hosted_invoice_url: invoice.hosted_invoice_url ?? null,
    line_items: invoice.lines.data.map((line) => ({
      id: line.id,
      description: line.description ?? '',
      amount: line.amount,
      quantity: line.quantity ?? 1,
      period: {
        start: new Date(line.period.start * 1000).toISOString(),
        end: new Date(line.period.end * 1000).toISOString(),
      },
    })),
  }));
}
