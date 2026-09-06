'use client';

import { CircleCheck, Download, Minus, Plus, Settings as SettingsIcon } from 'lucide-react';
import { useState } from 'react';

import { cn } from '../cn';
import { Spinner } from '../primitives/Spinner';
import { ConnectorLogo } from '../settings-modal/ConnectorLogo';
import {
  CARD_INSTALL_LABELS,
  CARD_REMOVE_LABELS,
  CONNECTED_GLYPH_LABEL,
  CONNECTOR_CARD_ACTION_LABELS,
  DIRECTORY_COUNT_SUFFIXES,
  DIRECTORY_EMPTY_COPY,
  DIRECTORY_LOADING_LABEL,
  DIRECTORY_RETRY_LABEL,
  NEW_BADGE_LABEL,
  SETTINGS_LABEL,
} from './constants';
import { DirectoryBadges, splitDirectoryBadges } from './DirectoryBadges';
import { formatInstallCount } from './filtering';
import {
  DIRECTORY_ADD_BUTTON,
  DIRECTORY_CARD,
  DIRECTORY_FOCUS_RING,
  DIRECTORY_ICON_BUTTON,
  ENTRY_ICON_SHAPE,
  ENTRY_ICON_SIZE,
} from './styles';
import type { DirectoryEntry, DirectorySectionKey } from './types';

const SKELETON_ROWS = 4;
const CONNECTED_GLYPH_SECTION: DirectorySectionKey = 'connectors';

function entryMonogram(entry: DirectoryEntry): string {
  return entry.monogram ?? entry.name.slice(0, 1).toUpperCase();
}

function Monogram({ entry }: { entry: DirectoryEntry }) {
  return (
    <span
      aria-hidden
      className={cn(
        ENTRY_ICON_SIZE,
        ENTRY_ICON_SHAPE,
        'inline-flex items-center justify-center text-sm font-semibold',
      )}
    >
      {entryMonogram(entry)}
    </span>
  );
}

function EntryIcon({ entry }: { entry: DirectoryEntry }) {
  const [iconFailed, setIconFailed] = useState(false);
  if (entry.slashName) return null;
  if (entry.brandId) {
    return (
      <ConnectorLogo
        connectorId={entry.brandId}
        fallbackText={entryMonogram(entry)}
        size="lg"
        className={ENTRY_ICON_SHAPE}
      />
    );
  }
  if (entry.iconUrl && !iconFailed) {
    return (
      <img
        src={entry.iconUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setIconFailed(true)}
        className={cn(ENTRY_ICON_SIZE, ENTRY_ICON_SHAPE, 'object-contain p-1.5')}
      />
    );
  }
  return <Monogram entry={entry} />;
}

export function DirectoryCard({
  section,
  entry,
  onOpen,
  onInstall,
  onOpenSettings,
  onRemove,
}: {
  section: DirectorySectionKey;
  entry: DirectoryEntry;
  onOpen: (id: string) => void;
  onInstall?: (id: string) => void;
  onOpenSettings?: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  const count = formatInstallCount(entry.installCount);
  const countSuffix = DIRECTORY_COUNT_SUFFIXES[section];
  const publisher = entry.publisher === entry.name ? undefined : entry.publisher;
  const connectedGlyph = section === CONNECTED_GLYPH_SECTION && entry.installed === true;
  const editable = entry.editable === true && onOpenSettings !== undefined;
  const installedAction = editable ? onOpenSettings : (onRemove ?? onOpenSettings);
  const installedLabel =
    installedAction === onOpenSettings ? SETTINGS_LABEL : CARD_REMOVE_LABELS[section];
  const InstalledIcon = installedAction === onOpenSettings ? SettingsIcon : Minus;
  const addLabel = entry.connectableMode
    ? CONNECTOR_CARD_ACTION_LABELS[entry.connectableMode]
    : CARD_INSTALL_LABELS[section];
  const trailingLabel = entry.installed ? installedLabel : addLabel;
  const trailingAction = entry.installed
    ? installedAction
    : entry.installable === false
      ? undefined
      : onInstall;
  const TrailingIcon = entry.installed ? InstalledIcon : Plus;
  const { glyphs, pills } = splitDirectoryBadges(entry.badges);
  const hasMeta = pills.length > 0 || publisher || count;

  return (
    <div className={DIRECTORY_CARD}>
      <div className="flex items-start gap-3">
        <EntryIcon entry={entry} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <button
              type="button"
              onClick={() => onOpen(entry.id)}
              className={cn(
                'line-clamp-2 min-w-0 break-words text-left text-sm font-medium text-foreground after:absolute after:inset-0 after:content-[""]',
                entry.slashName && 'font-mono',
                DIRECTORY_FOCUS_RING,
              )}
            >
              {entry.slashName ? `/${entry.name}` : entry.name}
            </button>
            <DirectoryBadges badges={glyphs} className="mt-0.5" />
            {entry.isNew ? (
              <span className="shrink-0 text-xs font-medium leading-5 text-muted-foreground">
                {NEW_BADGE_LABEL}
              </span>
            ) : null}
          </div>
          {hasMeta ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
              <DirectoryBadges badges={pills} />
              {publisher ? <span className="min-w-0 truncate">{publisher}</span> : null}
              {publisher && count ? <span aria-hidden>&middot;</span> : null}
              {count ? (
                <span className="inline-flex items-center gap-1">
                  {countSuffix ? null : <Download aria-hidden className="size-3" />}
                  <span className="font-mono">{count}</span>
                  {countSuffix ? <span>{countSuffix}</span> : null}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        {connectedGlyph ? (
          <CircleCheck
            role="img"
            aria-label={CONNECTED_GLYPH_LABEL}
            className="size-5 shrink-0 text-success-text"
          />
        ) : trailingAction ? (
          <button
            type="button"
            onClick={() => trailingAction(entry.id)}
            disabled={entry.mutating}
            aria-label={`${trailingLabel} ${entry.name}`}
            title={trailingLabel}
            className={cn(
              'relative z-10',
              DIRECTORY_ICON_BUTTON,
              !entry.installed && DIRECTORY_ADD_BUTTON,
              DIRECTORY_FOCUS_RING,
            )}
          >
            {entry.mutating ? (
              <Spinner size="sm" aria-label={trailingLabel} />
            ) : (
              <TrailingIcon aria-hidden className="size-4" />
            )}
          </button>
        ) : null}
      </div>
      <p className="line-clamp-2 text-xs text-muted-foreground">{entry.description}</p>
      {entry.statusLabel ? (
        <p className="text-xs text-muted-foreground">{entry.statusLabel}</p>
      ) : null}
      {entry.error ? <p className="text-xs text-danger">{entry.error}</p> : null}
    </div>
  );
}

export function DirectoryGrid({
  section,
  entries,
  loading,
  error,
  onRetry,
  onOpen,
  onInstall,
  onOpenSettings,
  onRemove,
}: {
  section: DirectorySectionKey;
  entries: readonly DirectoryEntry[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => Promise<void> | void;
  onOpen: (id: string) => void;
  onInstall?: (id: string) => void;
  onOpenSettings?: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  if (loading && entries.length === 0) {
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-3">
        <span className="sr-only">{DIRECTORY_LOADING_LABEL}</span>
        {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
          <div key={index} aria-hidden="true" className={cn(DIRECTORY_CARD, 'cursor-default')}>
            <div className="flex items-start gap-3">
              <div className="size-11 shrink-0 animate-pulse rounded-xl bg-foreground/10" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3.5 w-2/5 animate-pulse rounded bg-foreground/10" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-foreground/[0.07]" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-danger">{error}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={() => void onRetry()}
            className={cn(
              'inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted',
              DIRECTORY_FOCUS_RING,
            )}
          >
            {DIRECTORY_RETRY_LABEL}
          </button>
        ) : null}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        {DIRECTORY_EMPTY_COPY[section]}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {entries.map((entry) => (
        <DirectoryCard
          key={entry.id}
          section={section}
          entry={entry}
          onOpen={onOpen}
          onInstall={onInstall}
          onOpenSettings={onOpenSettings}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
