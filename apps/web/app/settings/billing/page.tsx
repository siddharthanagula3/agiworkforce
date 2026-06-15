'use client';

/**
 * /settings/billing — opens the settings modal at the Billing section.
 * The actual wired content (plan, payment, invoices) renders inside WebSettingsModal.
 */
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';

export default function BillingSettingsPage() {
  return <SettingsModalRedirect section="billing" />;
}
