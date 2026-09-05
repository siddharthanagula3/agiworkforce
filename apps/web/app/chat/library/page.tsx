'use client';

import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { LibraryView } from '@features/library/components/LibraryView';

export default function LibraryPage() {
  return (
    <WebAppShell>
      <main
        data-design="agi"
        className="min-h-full px-4 py-8 sm:px-8 sm:py-12"
        style={{
          background: 'hsl(var(--background))',
          color: 'hsl(var(--foreground))',
        }}
      >
        <LibraryView />
      </main>
    </WebAppShell>
  );
}
