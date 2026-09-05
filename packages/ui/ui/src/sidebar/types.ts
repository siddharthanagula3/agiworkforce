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
  /**
   * Set while this conversation has a turn in flight, so the recents list can
   * say so (shell-04 / agentic-modes-gap-03). Undefined means "nothing known",
   * not "idle", a host that cannot observe run state simply omits it rather
   * than asserting a conversation is idle when it may not be.
   */
  runState?: 'running';
  /**
   * The row is an AGI Work task rather than an ordinary chat. Both leaders mark
   * this inline in the one shared list (ChatGPT a text badge, Claude a filled
   * dot) instead of filing tasks somewhere else.
   */
  agiWork?: boolean;
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
