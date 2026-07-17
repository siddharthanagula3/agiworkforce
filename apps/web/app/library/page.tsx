'use client';

import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { LibraryView } from '@features/library/components/LibraryView';

/**
 * /library · top-level Library hub on web — browse every file cataloged in
 * `media_assets` (generated images, code-interpreter outputs, documents)
 * without scrolling back to the originating message. ChatGPT-"Library" /
 * mobile-LibraryScreen parity of concept.
 *
 * Mounted inside the shared WebAppShell (same as /projects) so the page stays
 * in the product shell; the route is auth-protected in proxy.ts. All data
 * loading lives in LibraryView and is gated on Clerk isSignedIn.
 */
export default function LibraryPage() {
  return (
    <WebAppShell>
      <main
        data-design="agi"
        style={{
          minHeight: '100%',
          background: 'var(--agi-bg-2)',
          padding: '48px 32px',
          color: 'var(--agi-ink)',
        }}
      >
        <LibraryView />
      </main>
    </WebAppShell>
  );
}
