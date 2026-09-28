'use client';

import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { LibraryView } from '@features/library/components/LibraryView';

export default function LibraryPage() {
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
        <LibraryView />
      </section>
    </WebAppShell>
  );
}
