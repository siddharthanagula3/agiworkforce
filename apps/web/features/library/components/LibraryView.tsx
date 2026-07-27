'use client';

/**
 * Web adapter for the shared Library surface.
 *
 * The view itself lives in `@agiworkforce/unified-chat` so Desktop renders the
 * same Library rather than a second implementation of it. This file supplies
 * only what differs on web: Clerk's session state, same-origin cookie fetches,
 * the CSRF header the restore endpoint requires, and "open in a new tab".
 *
 * Downloads and previews still go through the authed same-origin
 * `/api/files/{id}` route — no public URLs.
 */

import { useMemo } from 'react';
import { useAuth } from '@clerk/nextjs';
import {
  LibraryView as SharedLibraryView,
  type LibraryTransport,
} from '@agiworkforce/unified-chat';
import { getCsrfToken } from '@/lib/client/csrf';

export { iconKindFor, generatedFileFromLibraryItem } from '@agiworkforce/unified-chat';

export function LibraryView() {
  const { isSignedIn } = useAuth();

  const transport = useMemo<LibraryTransport>(
    () => ({
      isSignedIn: Boolean(isSignedIn),
      listPage: (params) =>
        fetch(`/api/library?${params.toString()}`, { credentials: 'same-origin' }),
      fetchAsset: (uri) => fetch(uri, { credentials: 'same-origin' }),
      restoreItem: async (id) => {
        // The restore endpoint is state-changing, so it carries the CSRF token.
        const csrf = await getCsrfToken();
        return fetch(`/api/media?id=${encodeURIComponent(id)}`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'x-csrf-token': csrf },
        });
      },
      // The serve route responds with Content-Disposition: inline, so the
      // browser renders it rather than downloading a second copy.
      openPreview: (uri) => {
        window.open(uri, '_blank', 'noopener,noreferrer');
      },
    }),
    [isSignedIn],
  );

  return <SharedLibraryView transport={transport} />;
}
