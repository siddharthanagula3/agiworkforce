'use client';

import { ArrowLeft, ArrowUpRight, Link2, Settings as SettingsIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../cn';
import { Spinner } from '../primitives/Spinner';
import { COPY_LINK_LABEL, DIRECTORY_BACK_LABEL, REMOVE_LABEL, SETTINGS_LABEL } from './constants';
import {
  DETAIL_LOGO_SHAPE,
  DETAIL_LOGO_SIZE,
  DIRECTORY_FOCUS_RING,
  DIRECTORY_ICON_BUTTON,
} from './styles';

export function DetailMonogram({ monogram }: { monogram: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        DETAIL_LOGO_SIZE,
        DETAIL_LOGO_SHAPE,
        'inline-flex items-center justify-center text-xl font-semibold',
      )}
    >
      {monogram}
    </span>
  );
}

export function OutboundLink({
  href,
  children,
  onOpenHref,
}: {
  href: string;
  children: ReactNode;
  onOpenHref?: (href: string) => Promise<void> | void;
}) {
  return (
    <button
      type="button"
      onClick={() => void onOpenHref?.(href)}
      className={cn(
        'inline-flex w-fit items-center gap-1 text-sm text-foreground underline underline-offset-4',
        DIRECTORY_FOCUS_RING,
      )}
    >
      {children}
      <ArrowUpRight aria-hidden className="size-3.5" />
    </button>
  );
}

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
  primarySecondary,
  onPrimary,
  onOpenSettings,
  onRemove,
  removeLabel,
  onCopyLink,
  statusNote,
  busy,
}: {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  name: string;
  primaryLabel: string;
  primaryDone: boolean;
  primarySecondary?: boolean;
  onPrimary?: () => void;
  onOpenSettings?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  onCopyLink?: () => void;
  statusNote?: ReactNode;
  busy?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      {icon}
      <div className="min-w-0 flex-1 basis-40">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="break-words text-xl font-semibold text-foreground">{title}</h3>
          {badge}
        </div>
        {subtitle ? <div className="mt-0.5 text-sm text-muted-foreground">{subtitle}</div> : null}
      </div>
      <div className="flex w-full shrink-0 items-center gap-1 sm:w-auto">
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
              'inline-flex min-h-9 items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors motion-reduce:transition-none disabled:opacity-50',
              primarySecondary
                ? 'border border-border text-foreground hover:bg-muted'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
              DIRECTORY_FOCUS_RING,
            )}
          >
            {busy ? <Spinner size="sm" aria-label={primaryLabel} /> : null}
            {primaryLabel}
          </button>
        ) : statusNote ? (
          <span className="text-sm text-muted-foreground">{statusNote}</span>
        ) : null}
      </div>
    </div>
  );
}
