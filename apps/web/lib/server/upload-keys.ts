import 'server-only';

import { secureFilenameSegment } from '@/lib/secure-random';

export type UploadObjectKind = 'avatar' | 'knowledge-file' | 'chat-attachment';

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0
    ? fileName
        .slice(dot + 1)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') || 'bin'
    : 'bin';
}

export function uploadObjectKey(
  kind: UploadObjectKind,
  scope: { userId: string; projectId?: string | null; fileName: string },
): string {
  const suffix = `${Date.now()}_${secureFilenameSegment(13)}.${extensionOf(scope.fileName)}`;
  if (kind === 'avatar') return `avatars/${scope.userId}/${suffix}`;
  if (kind === 'knowledge-file') {
    if (!scope.projectId) throw new Error('A project upload names its project.');
    return `knowledge-files/projects/${scope.projectId}/${suffix}`;
  }
  return `chat-attachments/${scope.userId}/${suffix}`;
}
