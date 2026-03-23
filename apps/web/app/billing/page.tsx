'use client';

import BillingDashboard from '@features/billing/pages/BillingDashboard';
import { TokenAnalyticsDashboard } from '@features/chat/components/tokens/TokenAnalyticsDashboard';
import { TokenBalanceDisplay } from '@features/chat/components/tokens/TokenBalanceDisplay';

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

        {/* Credit Balance */}
        <TokenBalanceDisplay />

        {/* Billing — plan, features, invoices, payment methods */}
        <BillingDashboard />

        {/* Usage Analytics — token usage trends, per-session breakdown, costs */}
        <TokenAnalyticsDashboard />
      </div>
    </div>
  );
}
