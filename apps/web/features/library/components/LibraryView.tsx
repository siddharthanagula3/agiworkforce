'use client';

import { useMemo } from 'react';
import { useAuth } from '@clerk/nextjs';
import {
  LibraryView as SharedLibraryView,
  type LibraryTransport,
} from '@agiworkforce/unified-chat';
import { getCsrfToken } from '@/lib/client/csrf';

export { iconKindFor, generatedFileFromLibraryItem } from '@agiworkforce/unified-chat';

export function LibraryView() {
  const { isLoaded, isSignedIn } = useAuth();

  const transport = useMemo<LibraryTransport>(
    () => ({
      isAuthReady: isLoaded,
      isSignedIn: Boolean(isSignedIn),
      listPage: (params) =>
        fetch(`/api/library?${params.toString()}`, { credentials: 'same-origin' }),
      fetchAsset: (uri) => fetch(uri, { credentials: 'same-origin' }),
      inlinePreviewUri: (uri) => uri,
      deleteItem: async (id) => {
        const csrf = await getCsrfToken();
        return fetch(`/api/media?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: { 'x-csrf-token': csrf },
        });
      },
      permanentlyDeleteItem: async (id) => {
        const csrf = await getCsrfToken();
        return fetch(`/api/media?id=${encodeURIComponent(id)}&permanent=true`, {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: { 'x-csrf-token': csrf },
        });
      },
      restoreItem: async (id) => {
        const csrf = await getCsrfToken();
        return fetch(`/api/media?id=${encodeURIComponent(id)}`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'x-csrf-token': csrf },
        });
      },
      openPreview: (uri) => {
        window.open(uri, '_blank', 'noopener,noreferrer');
      },
    }),
    [isLoaded, isSignedIn],
  );

  return <SharedLibraryView transport={transport} />;
}
