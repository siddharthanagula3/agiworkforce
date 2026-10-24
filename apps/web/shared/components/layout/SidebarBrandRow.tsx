'use client';

import { SidebarWordmark } from '@shared/components/agi/SidebarWordmark';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';

export function SidebarBrandRow() {
  return (
    <div className="@container flex w-full items-center justify-between gap-1">
      <SidebarWordmark />
      <NotificationBell />
    </div>
  );
}
