'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/identity/client';
import {
  LibraryView as SharedLibraryView,
  type LibraryFolder,
  type LibraryTransport,
  type SurfaceFilter,
} from '@agiworkforce/unified-chat';
import { getCsrfToken } from '@/lib/client/csrf';
import { exportDocument } from '@features/chat/services/document-export-service';
import { uploadChatAttachments } from '@features/chat/services/chat-attachment-upload';
import { CONTENT_OVERLAY_ROOT_ID } from '@shared/components/layout/WebAppShell';

export { iconKindFor, generatedFileFromLibraryItem } from '@agiworkforce/unified-chat';

const PROJECTS_PATH = '/chat/projects';
const PROJECT_LIST_ENDPOINT = '/api/projects';

function surfaceFromParam(value: string | null): SurfaceFilter {
  return value === 'artifact' || value === 'file' ? value : 'all';
}

interface ProjectListRow {
  id?: unknown;
  name?: unknown;
  updatedAt?: unknown;
  conversationCount?: unknown;
}

function foldersFromProjectList(body: unknown): LibraryFolder[] {
  const rows = (body as { projects?: unknown }).projects;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row: ProjectListRow) => {
    const id = typeof row.id === 'string' ? row.id : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!id || !name) return [];
    return [
      {
        id,
        name,
        updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
        itemCount: typeof row.conversationCount === 'number' ? row.conversationCount : null,
      },
    ];
  });
}

export function LibraryView() {
  const { isLoaded, isSignedIn } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSurface = surfaceFromParam(searchParams?.get('surface') ?? null);

  const openFolder = useCallback(
    (folder: LibraryFolder) => router.push(`${PROJECTS_PATH}/${encodeURIComponent(folder.id)}`),
    [router],
  );

  const createFolder = useCallback(() => router.push(PROJECTS_PATH), [router]);

  const transport = useMemo<LibraryTransport>(
    () => ({
      isAuthReady: isLoaded,
      isSignedIn: Boolean(isSignedIn),
      listPage: (params) =>
        fetch(`/api/library?${params.toString()}`, { credentials: 'same-origin' }),
      fetchAsset: (uri) => fetch(uri, { credentials: 'same-origin' }),
      inlinePreviewUri: (uri) => uri,
      listFolders: async () => {
        const response = await fetch(PROJECT_LIST_ENDPOINT, { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return foldersFromProjectList(await response.json());
      },
      openFolder,
      createFolder,
      uploadFiles: async (files) => {
        await uploadChatAttachments(files);
      },
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
      // There is no handoff that carries an existing asset into a brand-new
      // (non-project) chat, only the project-scoped one WebChatPage reads.
      // This starts a real chat with the file named in the first message
      // rather than a dead composer, but it is text, not a true attachment.
      askAboutFile: (item, message) => {
        router.push(
          `/chat?starterPrompt=${encodeURIComponent(`About ${item.file_name}: ${message}`)}`,
        );
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
    [isLoaded, isSignedIn, openFolder, createFolder, router],
  );

  return (
    <SharedLibraryView
      transport={transport}
      initialSurface={initialSurface}
      overlayContainerId={CONTENT_OVERLAY_ROOT_ID}
    />
  );
}
