'use client';

import Link from 'next/link';
import { AgiMark } from '@shared/components/agi/AgiMark';

export function SidebarWordmark() {
  return (
    <Link
      href="/chat"
      aria-label="AGI Workforce home"
      className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <AgiMark size={20} className="shrink-0" />
      <span
        className="whitespace-nowrap text-[15px] font-medium leading-none tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-newsreader), Georgia, 'Times New Roman', serif" }}
      >
        AGI Workforce
      </span>
    </Link>
  );
}
