'use client';

import { DirectoryModal, type DirectorySectionKey } from '@agiworkforce/ui';

import { useDirectoryAdapter } from '../hooks/useDirectoryAdapter';

export function WebDirectoryModal({
  open,
  onClose,
  initialSection,
  initialEntryId,
  onRouteChange,
}: {
  open: boolean;
  onClose: () => void;
  initialSection?: DirectorySectionKey;
  initialEntryId?: string | null;
  onRouteChange?: (section: DirectorySectionKey, entryId: string | null) => void;
}) {
  const adapter = useDirectoryAdapter();
  return (
    <DirectoryModal
      open={open}
      onClose={onClose}
      adapter={adapter}
      {...(initialSection ? { initialSection } : {})}
      {...(initialEntryId === undefined ? {} : { initialEntryId })}
      {...(onRouteChange ? { onRouteChange } : {})}
    />
  );
}
