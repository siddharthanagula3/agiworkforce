'use client';

import Link from 'next/link';
import { MonitorPlay } from '@agiworkforce/icons';
import { useDesktopHost } from '@/features/desktop-host';
import { REMOTE_COMPUTER_PATH } from '../lib/browser-pairing';

const LABEL = 'Your computer';

interface RemoteComputerLinkProps {
  glyphSize: number;
  className?: string;
  glyphClassName?: string;
  labelClassName?: string;
}

export function RemoteComputerLink({
  glyphSize,
  className,
  glyphClassName,
  labelClassName,
}: RemoteComputerLinkProps) {
  const host = useDesktopHost();
  if (host) return null;
  return (
    <Link href={REMOTE_COMPUTER_PATH} className={className}>
      <span className={glyphClassName}>
        <MonitorPlay size={glyphSize} aria-hidden="true" />
      </span>
      <span className={labelClassName}>{LABEL}</span>
    </Link>
  );
}
