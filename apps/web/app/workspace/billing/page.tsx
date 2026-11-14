import type { Metadata } from 'next';
import { ConsolePage } from '@/features/workspace-console/components/ConsolePage';
import { WorkspaceBillingSummary } from '@/features/workspace-console/components/WorkspaceBillingSummary';

export const metadata: Metadata = {
  title: 'Billing',
  description: 'Plan, seats, and where to manage workspace billing.',
};

export default function WorkspaceBillingPage() {
  return (
    <ConsolePage
      help={{ docId: 'billing-and-plans', label: 'How plans and billing work' }}
      title="Billing"
      description="This workspace's plan and usage. Payment and invoices are in billing settings."
    >
      <WorkspaceBillingSummary />
    </ConsolePage>
  );
}
