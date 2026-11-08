'use client';

import Link from 'next/link';
import { PRODUCT_BRAND } from '@agiworkforce/types';
import { AgiMark } from '@shared/components/agi/AgiMark';

export function SidebarWordmark() {
  return (
    <Link
      href="/chat"
      aria-label={`${PRODUCT_BRAND} home`}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <AgiMark className="shrink-0" />
    </Link>
  );
}
