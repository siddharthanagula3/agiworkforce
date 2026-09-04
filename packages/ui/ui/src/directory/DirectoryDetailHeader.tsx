'use client';

import { ArrowLeft, Link2, Settings as SettingsIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../cn';
import { Spinner } from '../primitives/Spinner';
import { COPY_LINK_LABEL, DIRECTORY_BACK_LABEL, REMOVE_LABEL, SETTINGS_LABEL } from './constants';
import { DIRECTORY_FOCUS_RING, DIRECTORY_ICON_BUTTON } from './styles';

export function DirectoryBackLink({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className={cn(
        'inline-flex min-h-8 items-center gap-1 rounded-md pr-2 text-sm text-muted-foreground transition-colors motion-reduce:transition-none hover:text-foreground',
        DIRECTORY_FOCUS_RING,
      )}
    >
      <ArrowLeft aria-hidden className="size-4" />
      {DIRECTORY_BACK_LABEL}
    </button>
  );
}

export function DirectoryDetailHeader({
  title,
  subtitle,
  icon,
  badge,
  name,
  primaryLabel,
  primaryDone,
  onPrimary,
  onOpenSettings,
  onRemove,
  removeLabel,
  onCopyLink,
  busy,
}: {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  name: string;
  primaryLabel: string;
  primaryDone: boolean;
  onPrimary?: () => void;
  onOpenSettings?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  onCopyLink?: () => void;
  busy?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-xl font-semibold text-foreground">{title}</h3>
          {badge}
        </div>
        {subtitle ? <div className="mt-0.5 text-sm text-muted-foreground">{subtitle}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onCopyLink ? (
          <button
            type="button"
            onClick={onCopyLink}
            aria-label={`${COPY_LINK_LABEL} ${name}`}
            className={cn(DIRECTORY_ICON_BUTTON, DIRECTORY_FOCUS_RING)}
          >
            <Link2 aria-hidden className="size-4" />
          </button>
        ) : null}
        {primaryDone ? (
          <>
            <span className="text-sm text-muted-foreground">{primaryLabel}</span>
            {onOpenSettings ? (
              <button
                type="button"
                onClick={onOpenSettings}
                aria-label={`${SETTINGS_LABEL} ${name}`}
                className={cn(DIRECTORY_ICON_BUTTON, DIRECTORY_FOCUS_RING)}
              >
                <SettingsIcon aria-hidden className="size-4" />
              </button>
            ) : onRemove ? (
              <button
                type="button"
                onClick={onRemove}
                disabled={busy}
                className={cn(
                  'inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm text-foreground transition-colors motion-reduce:transition-none hover:bg-muted disabled:opacity-50',
                  DIRECTORY_FOCUS_RING,
                )}
              >
                {removeLabel ?? REMOVE_LABEL}
              </button>
            ) : null}
          </>
        ) : onPrimary ? (
          <button
            type="button"
            onClick={onPrimary}
            disabled={busy}
            className={cn(
              'inline-flex min-h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors motion-reduce:transition-none hover:bg-primary/90 disabled:opacity-50',
              DIRECTORY_FOCUS_RING,
            )}
          >
            {busy ? <Spinner size="sm" aria-label={primaryLabel} /> : null}
            {primaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
