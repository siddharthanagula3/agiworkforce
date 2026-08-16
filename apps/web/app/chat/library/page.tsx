'use client';

import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { LibraryView } from '@features/library/components/LibraryView';

export default function LibraryPage() {
  return (
    <WebAppShell>
      <main
        data-design="agi"
        style={{
          minHeight: '100%',
          background: 'hsl(var(--background))',
          padding: '48px 32px',
          color: 'hsl(var(--foreground))',
        }}
      >
        <LibraryView />
      </main>
    </WebAppShell>
  );
}
