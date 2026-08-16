import type { ReactNode } from 'react';

export interface SidebarSession {
  id: string;
  title: string;
  updatedAt: Date | string;
  lastMessage?: string;
  preview?: string;
  pinned?: boolean;
  starred?: boolean;
  archived?: boolean;
  projectId?: string;
  incognito?: boolean;
  messageCount?: number;
  hasCustomInstructions?: boolean;
}

export interface SidebarProject {
  id: string;
  name: string;
  color?: string;
  accentColor?: string;
  iconEmoji?: string;
  description?: string;
  conversationCount?: number;
  pinned?: boolean;
}

export type SidebarMode = 'local' | 'cloud';

export type SidebarTemporalGroup =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'last7Days'
  | 'last30Days'
  | 'older';

export interface SidebarNavItem {
  id: string;
  label: string;
  icon: SidebarIconComponent;
  onClick: () => void;
  isActive?: boolean;
  badge?: string | number;
}

export type SidebarIconComponent = (props: {
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}) => ReactNode;
