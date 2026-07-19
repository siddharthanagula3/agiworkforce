'use client';

import BillingDashboard from '@features/billing/pages/BillingDashboard';

export default function BillingPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing & Usage</h1>
          <p className="text-muted-foreground mt-2">
            Manage your subscription, track usage, and view spending.
          </p>
        </div>

        {/* Plan, percentage usage, invoices, and payment methods */}
        <BillingDashboard />
      </div>
    </div>
  );
}
