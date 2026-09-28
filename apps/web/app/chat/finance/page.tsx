'use client';

import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { FinanceDashboard } from '@features/finance/components/FinanceDashboard';

export default function FinancePage() {
  return (
    <WebAppShell>
      <section
        data-design="agi"
        className="min-h-full px-gutter-compact py-8 sm:px-gutter-regular sm:py-12 lg:px-gutter-wide"
        style={{
          background: 'hsl(var(--background))',
          color: 'hsl(var(--foreground))',
        }}
      >
        <FinanceDashboard />
      </section>
    </WebAppShell>
  );
}
