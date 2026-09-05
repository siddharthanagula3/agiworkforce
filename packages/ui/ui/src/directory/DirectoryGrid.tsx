'use client';

import { Download, Minus, Plus, Settings as SettingsIcon } from 'lucide-react';

import { cn } from '../cn';
import { Spinner } from '../primitives/Spinner';
import { ConnectorLogo } from '../settings-modal/ConnectorLogo';
import {
  ADD_LABEL,
  DIRECTORY_BADGE_LABELS,
  DIRECTORY_EMPTY_COPY,
  DIRECTORY_LOADING_LABEL,
  DIRECTORY_RETRY_LABEL,
  NEW_BADGE_LABEL,
  REMOVE_LABEL,
  SETTINGS_LABEL,
} from './constants';
import { formatInstallCount } from './filtering';
import {
  DIRECTORY_CARD,
  DIRECTORY_FOCUS_RING,
  DIRECTORY_ICON_BUTTON,
  ENTRY_ICON_SHAPE,
  ENTRY_ICON_SIZE,
} from './styles';
import type { DirectoryEntry, DirectorySectionKey } from './types';

function entryMonogram(entry: DirectoryEntry): string {
  return entry.monogram ?? entry.name.slice(0, 1).toUpperCase();
}

function EntryIcon({ entry }: { entry: DirectoryEntry }) {
  if (entry.slashName) return null;
  if (entry.brandId) {
    return (
      <ConnectorLogo
        connectorId={entry.brandId}
        fallbackText={entryMonogram(entry)}
        size="sm"
        className={ENTRY_ICON_SHAPE}
      />
    );
  }
  if (entry.iconUrl) {
    return (
      <img
        src={entry.iconUrl}
        alt=""
        className={cn(ENTRY_ICON_SIZE, ENTRY_ICON_SHAPE, 'object-contain')}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        ENTRY_ICON_SIZE,
        ENTRY_ICON_SHAPE,
        'inline-flex items-center justify-center text-xs font-semibold',
      )}
    >
      {entryMonogram(entry)}
    </span>
  );
}

export function DirectoryCard({
  entry,
  onOpen,
  onInstall,
  onOpenSettings,
  onRemove,
}: {
  entry: DirectoryEntry;
  onOpen: (id: string) => void;
  onInstall?: (id: string) => void;
  onOpenSettings?: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  const count = formatInstallCount(entry.installCount);
  const publisher = entry.publisher === entry.name ? undefined : entry.publisher;
  const installedAction = onOpenSettings ?? onRemove;
  const installedLabel = onOpenSettings ? SETTINGS_LABEL : REMOVE_LABEL;
  const InstalledIcon = onOpenSettings ? SettingsIcon : Minus;
  const trailingLabel = entry.installed ? installedLabel : ADD_LABEL;
  const trailingAction = entry.installed
    ? installedAction
    : entry.installable === false
      ? undefined
      : onInstall;
  const TrailingIcon = entry.installed ? InstalledIcon : Plus;

  return (
    <div className={DIRECTORY_CARD}>
      <div className="flex items-start gap-3">
        <EntryIcon entry={entry} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onOpen(entry.id)}
              className={cn(
                'min-w-0 truncate text-sm font-semibold text-foreground after:absolute after:inset-0 after:content-[""]',
                entry.slashName && 'font-mono',
                DIRECTORY_FOCUS_RING,
              )}
            >
              {entry.slashName ? `/${entry.name}` : entry.name}
            </button>
            {entry.isNew ? (
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                {NEW_BADGE_LABEL}
              </span>
            ) : null}
            {(entry.badges ?? []).map((badge) => (
              <span
                key={badge}
                className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {DIRECTORY_BADGE_LABELS[badge]}
              </span>
            ))}
          </div>
          {publisher || count ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              {publisher ? <span className="truncate">{publisher}</span> : null}
              {publisher && count ? <span aria-hidden>&middot;</span> : null}
              {count ? (
                <span className="inline-flex items-center gap-1 font-mono">
                  <Download aria-hidden className="size-3" />
                  {count}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        {trailingAction ? (
          <button
            type="button"
            onClick={() => trailingAction(entry.id)}
            disabled={entry.mutating}
            aria-label={`${trailingLabel} ${entry.name}`}
            className={cn('relative z-10', DIRECTORY_ICON_BUTTON, DIRECTORY_FOCUS_RING)}
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
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} aria-hidden="true" className={cn(DIRECTORY_CARD, 'cursor-default')}>
            <div className="flex items-start gap-3">
              <div className="size-8 shrink-0 animate-pulse rounded-md bg-foreground/10" />
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
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {entries.map((entry) => (
        <DirectoryCard
          key={entry.id}
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
