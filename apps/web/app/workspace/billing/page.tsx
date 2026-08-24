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
      title="Billing"
      description="What this workspace is on and what it consumes. Payment and invoices are handled in billing settings."
    >
      <WorkspaceBillingSummary />
    </ConsolePage>
  );
}
