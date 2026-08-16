'use client';

import Link from 'next/link';
import { AgiMark } from '@shared/components/agi/AgiMark';

export function SidebarWordmark() {
  return (
    <Link
      href="/chat"
      aria-label="AGI Workforce home"
      className="flex items-center gap-2 rounded-md px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <AgiMark size={20} />
      <span
        className="text-[15px] font-medium leading-none tracking-tight text-[hsl(var(--foreground))]"
        style={{ fontFamily: "var(--font-newsreader), Georgia, 'Times New Roman', serif" }}
      >
        AGI Workforce
      </span>
    </Link>
  );
}
