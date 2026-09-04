'use client';

import { Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
  AddMarketplaceDialog,
  DirectoryPanel,
  type DirectoryAdapter,
  type DirectorySectionKey,
} from '@agiworkforce/ui';

import { ADD_MARKETPLACE_TRIGGER_LABEL, MARKETPLACE_TRIGGER_CLASS } from '../constants';
import { buildSettingsBrowseHash, parseSettingsDirectoryHash } from '../routing';

export function DirectorySettingsPanel({
  section,
  adapter,
}: {
  section: DirectorySectionKey;
  adapter: DirectoryAdapter;
}) {
  const [entryId, setEntryId] = useState<string | null>(null);
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);

  useEffect(() => {
    const sync = () => {
      const parsed = parseSettingsDirectoryHash(window.location.hash);
      if (!parsed || parsed.section !== section) return;
      setEntryId(parsed.entryId);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [section]);

  const onOpenEntryChange = useCallback(
    (nextId: string | null) => {
      if (typeof window === 'undefined') return;
      const parsed = parseSettingsDirectoryHash(window.location.hash);
      if (!parsed || parsed.section !== section) return;
      if (parsed.entryId === nextId) return;
      window.history.replaceState(null, '', buildSettingsBrowseHash(section, nextId));
    },
    [section],
  );

  const showMarketplace = section === 'plugins' && adapter.addMarketplace !== undefined;

  return (
    <>
      <DirectoryPanel
        section={section}
        adapter={adapter}
        openEntryId={entryId}
        onOpenEntryChange={onOpenEntryChange}
        {...(showMarketplace
          ? {
              headerActions: (
                <button
                  type="button"
                  onClick={() => setMarketplaceOpen(true)}
                  aria-label={ADD_MARKETPLACE_TRIGGER_LABEL}
                  className={MARKETPLACE_TRIGGER_CLASS}
                >
                  <Plus aria-hidden className="size-4" />
                </button>
              ),
            }
          : {})}
      />
      {adapter.addMarketplace ? (
        <AddMarketplaceDialog
          open={marketplaceOpen}
          onClose={() => {
            setMarketplaceOpen(false);
            void adapter.loadSection?.('plugins');
          }}
          onSubmit={adapter.addMarketplace}
          {...(adapter.removeMarketplace ? { onRemove: adapter.removeMarketplace } : {})}
        />
      ) : null}
    </>
  );
}
