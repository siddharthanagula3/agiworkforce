import type { SidebarTemporalGroup } from './types';

export const TEMPORAL_LABELS: Record<SidebarTemporalGroup, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  last7Days: 'Last 7 Days',
  last30Days: 'Last 30 Days',
  older: 'Older',
};

export function getTemporalGroup(date: Date): SidebarTemporalGroup {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(thisWeekStart.getDate() - today.getDay());
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const conversationDate = new Date(date);

  if (conversationDate >= today) {
    return 'today';
  } else if (conversationDate >= yesterday && conversationDate < today) {
    return 'yesterday';
  } else if (conversationDate >= thisWeekStart && conversationDate < yesterday) {
    return 'thisWeek';
  } else if (conversationDate >= sevenDaysAgo) {
    return 'last7Days';
  } else if (conversationDate >= thirtyDaysAgo) {
    return 'last30Days';
  } else {
    return 'older';
  }
}

export function toSafeDate(raw: Date | string | undefined): Date {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? new Date(0) : raw;
  }
  if (!raw) return new Date(0);
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}
