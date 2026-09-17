'use client';

import { SidebarWordmark } from '@shared/components/agi/SidebarWordmark';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';

export function SidebarBrandRow() {
  return (
    <div className="flex w-full items-center justify-between gap-2">
      <SidebarWordmark />
      <NotificationBell />
    </div>
  );
}
