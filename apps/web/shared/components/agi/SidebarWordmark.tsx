'use client';

import Link from 'next/link';
import { AgiMark } from '@shared/components/agi/AgiMark';

export function SidebarWordmark() {
  return (
    <Link
      href="/chat"
      aria-label="AGI home"
      className="flex shrink-0 items-center gap-2 rounded-md px-0 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-focus-ring @[7rem]:px-1"
    >
      <AgiMark size={20} className="shrink-0" />
      <span className="hidden whitespace-nowrap text-[15px] font-semibold leading-none tracking-tight text-foreground @[7rem]:inline">
        AGI
      </span>
    </Link>
  );
}
