'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from '@agiworkforce/icons';
import { CONNECTORS } from '@/features/connectors/data/connectors';
import { useConnectors } from '@/features/connectors/hooks/use-connectors';
import { buildSettingsBrowseHash } from '@/features/directory';
import { useSettingsModal } from '@/features/settings/components/SettingsModalProvider';

const CONNECTED_ENOUGH = 3;
const DEVICE_ONLY_CATEGORY = 'Exclusive';
const HIGH_IMPACT_RISK = 'high-impact';
const CONNECTORS_SECTION = 'connectors';
const DISMISSED_STORAGE_KEY = 'agi-new-chat-connector-suggestions-dismissed';

const LINK_CLASS =
  'rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, 'true');
  } catch {
    return;
  }
}

export function NewChatConnectorSuggestions({ show }: { show: boolean }) {
  const { t } = useTranslation('common');
  const { connectedIds, availableIds, loading, error } = useConnectors();
  const { openSettings } = useSettingsModal();
  const [dismissed, setDismissed] = useState(readDismissed);

  const hasConnectableApp = useMemo(
    () =>
      CONNECTORS.some(
        (connector) =>
          availableIds.has(connector.id) &&
          !connectedIds.has(connector.id) &&
          connector.category !== DEVICE_ONLY_CATEGORY &&
          connector.riskClass !== HIGH_IMPACT_RISK,
      ),
    [availableIds, connectedIds],
  );

  if (!show || dismissed || loading || error || connectedIds.size >= CONNECTED_ENOUGH) return null;
  if (!hasConnectableApp) return null;

  const openConnectors = () => {
    window.location.hash = buildSettingsBrowseHash(CONNECTORS_SECTION);
    openSettings(CONNECTORS_SECTION);
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button type="button" onClick={openConnectors} className={LINK_CLASS}>
        {t('newChat.connectors.optionalLink')}
      </button>
      <button
        type="button"
        onClick={() => {
          writeDismissed();
          setDismissed(true);
        }}
        aria-label={t('newChat.connectors.dismiss')}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:h-11 pointer-coarse:w-11"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
