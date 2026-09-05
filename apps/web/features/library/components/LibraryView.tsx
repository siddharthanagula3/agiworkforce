'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/identity/client';
import {
  LibraryView as SharedLibraryView,
  type LibraryTransport,
  type SurfaceFilter,
} from '@agiworkforce/unified-chat';
import { getCsrfToken } from '@/lib/client/csrf';
import { exportDocument } from '@features/chat/services/document-export-service';

export { iconKindFor, generatedFileFromLibraryItem } from '@agiworkforce/unified-chat';

function surfaceFromParam(value: string | null): SurfaceFilter {
  return value === 'artifact' || value === 'file' ? value : 'all';
}

export function LibraryView() {
  const { isLoaded, isSignedIn } = useSession();
  const searchParams = useSearchParams();
  const initialSurface = surfaceFromParam(searchParams?.get('surface') ?? null);

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
      // 'excel' is deliberately absent: the export service builds PDF and DOCX
      // and there is no xlsx writer on web, so offering it would be a control
      // that fails after the user picks it.
      nativeExportFormats: ['pdf', 'word'] as const,
      exportNative: (format, _artifactId, content, title) =>
        exportDocument(content, format === 'word' ? 'docx' : 'pdf', title || 'artifact', {
          title: title || 'Artifact',
        }),
    }),
    [isLoaded, isSignedIn],
  );

  return <SharedLibraryView transport={transport} initialSurface={initialSurface} />;
}
