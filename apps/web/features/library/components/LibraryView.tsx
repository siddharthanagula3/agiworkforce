'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/identity/client';
import { toast } from 'sonner';
import { publishArtifact } from '@agiworkforce/artifacts';
import {
  LibraryView as SharedLibraryView,
  artifactTypeForLibraryItem,
  generatedFileFromLibraryItem,
  type LibraryFolder,
  type LibraryTransport,
  type SurfaceFilter,
} from '@agiworkforce/unified-chat';
import type { LibraryItem } from '@agiworkforce/cloud-contracts';
import { getCsrfToken } from '@/lib/client/csrf';
import { exportDocument } from '@features/chat/services/document-export-service';
import { uploadChatAttachments } from '@features/chat/services/chat-attachment-upload';
import { CONTENT_OVERLAY_ROOT_ID } from '@shared/components/layout/WebAppShell';
import { libraryItemToFile } from '@features/chat/components/Composer/ComposerFilesMenu';
import { createWebCloudPublisher } from '@features/chat/components/artifacts/publishArtifactClient';
import { uploadProjectKnowledgeFile } from '@features/projects/services/project-knowledge-upload';
import { stageLibraryItemForNewChat } from '../lib/library-chat-handoff';

export { iconKindFor, generatedFileFromLibraryItem } from '@agiworkforce/unified-chat';

const PROJECTS_PATH = '/chat/projects';
const NEW_CHAT_PATH = '/chat';
const PROJECT_LIST_ENDPOINT = '/api/projects';

function publishableArtifactShape(item: LibraryItem): { type: string; language?: string } {
  const type = artifactTypeForLibraryItem(item);
  if (type === 'markdown') return { type: 'document', language: 'markdown' };
  if (type === 'json') return { type: 'code', language: 'json' };
  return { type };
}

async function shareLibraryArtifact(item: LibraryItem): Promise<void> {
  const response = await fetch(item.uri, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = await publishArtifact({
    artifact: {
      id: item.id,
      title: item.file_name,
      content: await response.text(),
      ...publishableArtifactShape(item),
    },
    privacyMode: 'managed',
    surface: 'web',
    originPrivacyMode: generatedFileFromLibraryItem(item).privacyMode,
    cloudPublisher: createWebCloudPublisher(),
  });
  if (result.kind === 'unavailable') throw new Error(result.reason);
  if (result.kind !== 'cloud') throw new Error('This artifact cannot be shared from the library.');
  try {
    await navigator.clipboard.writeText(result.shareUrl);
    toast.success('Link copied');
  } catch {
    toast.success('Link created', { description: result.shareUrl });
  }
}

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
      askAboutFile: (item, message) => {
        void stageLibraryItemForNewChat(item, { workMode: 'chat', draft: message }).then(
          () => router.push(NEW_CHAT_PATH),
          () => toast.error('That file could not be attached. Download it and attach it instead.'),
        );
      },
      addToChat: async (item) => {
        await stageLibraryItemForNewChat(item, { workMode: 'chat' });
        router.push(NEW_CHAT_PATH);
      },
      addToWork: async (item) => {
        await stageLibraryItemForNewChat(item, { workMode: 'agiwork' });
        router.push(NEW_CHAT_PATH);
      },
      addToProject: async (item, folder) => {
        await uploadProjectKnowledgeFile({
          projectId: folder.id,
          file: await libraryItemToFile(item),
        });
        toast.success(`Added to ${folder.name}`);
      },
      shareArtifact: shareLibraryArtifact,
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
