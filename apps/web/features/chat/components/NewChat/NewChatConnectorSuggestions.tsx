'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from '@agiworkforce/icons';
import { OfficialConnectorLogo } from '@/features/connectors/components/OfficialConnectorLogo';
import { CONNECTORS } from '@/features/connectors/data/connectors';
import { useConnectors } from '@/features/connectors/hooks/use-connectors';
import { buildSettingsBrowseHash } from '@/features/directory';
import { useSettingsModal } from '@/features/settings/components/SettingsModalProvider';

const SUGGESTION_LIMIT = 3;
const CONNECTED_ENOUGH = 3;
const DEVICE_ONLY_CATEGORY = 'Exclusive';
const HIGH_IMPACT_RISK = 'high-impact';
const CONNECTORS_SECTION = 'connectors';
const DISMISSED_STORAGE_KEY = 'agi-new-chat-connector-suggestions-dismissed';

const CHIP_CLASS =
  'inline-flex items-center gap-1.5 rounded-full border border-[var(--chat-border)] px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11';

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

export function NewChatConnectorSuggestions() {
  const { t } = useTranslation('common');
  const { connectedIds, availableIds, loading, error } = useConnectors();
  const { openSettings } = useSettingsModal();
  const [dismissed, setDismissed] = useState(readDismissed);

  const suggestions = useMemo(
    () =>
      CONNECTORS.filter(
        (connector) =>
          availableIds.has(connector.id) &&
          !connectedIds.has(connector.id) &&
          connector.category !== DEVICE_ONLY_CATEGORY &&
          connector.riskClass !== HIGH_IMPACT_RISK,
      ).slice(0, SUGGESTION_LIMIT),
    [availableIds, connectedIds],
  );

  if (dismissed || loading || error || connectedIds.size >= CONNECTED_ENOUGH) return null;
  if (suggestions.length === 0) return null;

  const openConnector = (connectorId?: string) => {
    window.location.hash = buildSettingsBrowseHash(CONNECTORS_SECTION, connectorId);
    openSettings(CONNECTORS_SECTION);
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span className="text-sm text-muted-foreground">{t('newChat.connectors.label')}</span>
      {suggestions.map((connector) => (
        <button
          key={connector.id}
          type="button"
          onClick={() => openConnector(connector.id)}
          aria-label={t('newChat.connectors.open', { name: connector.name })}
          className={CHIP_CLASS}
        >
          <OfficialConnectorLogo connector={connector} className="h-5 w-5 rounded-md shadow-none" />
          {connector.name}
        </button>
      ))}
      <button
        type="button"
        onClick={() => openConnector()}
        className="rounded-md px-2 py-1.5 text-sm font-medium text-[var(--chat-accent-primary-text)] transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11"
      >
        {t('newChat.connectors.seeAll')}
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
