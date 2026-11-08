'use client';

import { useOpenedFolderStore } from '../lib/open-granted-folder';

/** The folder File > Open Folder just approved, or why it was not. */
export function OpenedFolderNotice() {
  const folder = useOpenedFolderStore((state) => state.folder);
  const error = useOpenedFolderStore((state) => state.error);
  if (!folder && !error) return null;
  return (
    <p role="status" data-opened-folder="" className="pointer-events-auto text-sm text-foreground">
      {folder ? `Folder open: ${folder.name}` : error}
    </p>
  );
}
