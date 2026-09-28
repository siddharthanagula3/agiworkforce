'use client';

import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { HealthSpaceLanding } from '@features/health/components/HealthSpaceLanding';

export default function HealthPage() {
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
        <HealthSpaceLanding />
      </section>
    </WebAppShell>
  );
}
