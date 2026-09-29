'use client';

import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { FinanceDashboard } from '@features/finance/components/FinanceDashboard';

export default function FinancePage() {
  return (
    <WebAppShell>
      <section
        data-design="agi"
        className="min-h-full bg-background px-gutter-compact py-8 text-foreground sm:px-gutter-regular sm:py-12 lg:px-gutter-wide"
      >
        <FinanceDashboard />
      </section>
    </WebAppShell>
  );
}
