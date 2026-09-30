'use client';

import type { ComponentPropsWithRef } from 'react';
import { Download, Monitor } from '@agiworkforce/icons';
import { usePairedDesktop } from '../hooks/use-paired-desktop';

export interface ContinueOnDesktopProps extends Omit<
  ComponentPropsWithRef<'a'>,
  'href' | 'children' | 'title'
> {
  label: string;
  fallbackHref: string;
  glyphSize: number;
  glyphClassName?: string;
  labelClassName?: string;
  sessionId?: string;
}

export function ContinueOnDesktop({
  label,
  fallbackHref,
  glyphSize,
  glyphClassName,
  labelClassName,
  sessionId,
  ...anchor
}: ContinueOnDesktopProps) {
  const desktop = usePairedDesktop(sessionId);

  if (desktop.kind === 'in-desktop') return null;

  if (desktop.kind === 'no-desktop') {
    return (
      <a {...anchor} href={fallbackHref}>
        <span className={glyphClassName}>
          <Download size={glyphSize} aria-hidden="true" />
        </span>
        <span className={labelClassName}>{label}</span>
      </a>
    );
  }

  return (
    <a {...anchor} href={desktop.href} title={desktop.status}>
      <span className={glyphClassName}>
        <span className="relative inline-flex">
          <Monitor size={glyphSize} aria-hidden="true" />
          {desktop.presence === 'online' ? (
            <span
              aria-hidden="true"
              className="absolute -end-0.5 -top-0.5 size-1.5 rounded-full bg-[var(--chat-success)]"
            />
          ) : null}
        </span>
      </span>
      <span className={labelClassName}>
        {label}
        <span className="sr-only">. {desktop.status}</span>
      </span>
    </a>
  );
}
