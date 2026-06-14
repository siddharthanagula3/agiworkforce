/**
 * Shared <Sidebar> contracts.
 *
 * These types are the framework-agnostic shape the chat sidebar renders. They
 * normalize the desktop `ConversationSummary` (pinned/archived/projectId/
 * incognito) and the web `SessionLike` (isPinned/isStarred/isArchived) into a
 * single field set so neither surface loses pin/archive/star/project-filter
 * behavior. Surfaces map their store records into `SidebarSession` /
 * `SidebarProject` before passing them in.
 *
 * NO store, IO, router, or platform import lives here — pure data contracts.
 */
import type { ReactNode } from 'react';

/** A conversation row in the sidebar list. */
export interface SidebarSession {
  id: string;
  title: string;
  /** ISO string or Date — the component normalizes both for temporal grouping. */
  updatedAt: Date | string;
  /** Secondary preview line under the title. `preview` is the web alias of `lastMessage`. */
  lastMessage?: string;
  preview?: string;
  pinned?: boolean;
  starred?: boolean;
  archived?: boolean;
  /** Project this conversation belongs to (drives the attribution badge + filter). */
  projectId?: string;
  /** Incognito conversations get a subtle accent ring; never persisted by the component. */
  incognito?: boolean;
  messageCount?: number;
  /** When set, a small Sparkles affordance highlights that custom instructions exist. */
  hasCustomInstructions?: boolean;
}

/** A ChatGPT-style project folder shown in the filter dropdown + projects view. */
export interface SidebarProject {
  id: string;
  name: string;
  /** Hex or CSS color used for the folder swatch. */
  color?: string;
  accentColor?: string;
  iconEmoji?: string;
  description?: string;
  conversationCount?: number;
}

/** Footer mode pill state. Local = on-device; Cloud = AGI managed. */
export type SidebarMode = 'local' | 'cloud';

/** Temporal grouping buckets used by `getTemporalGroup`. */
export type SidebarTemporalGroup =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'last7Days'
  | 'last30Days'
  | 'older';

/**
 * Descriptor passed to `renderNavLink` so neither next/<Link> nor router.push
 * leaks into the shared package. The default renderer is a `<button onClick>`.
 */
export interface SidebarNavItem {
  id: string;
  label: string;
  /** lucide icon component (or any icon component accepting `className`). */
  icon: SidebarIconComponent;
  onClick: () => void;
  isActive?: boolean;
  /** Optional trailing badge text (e.g. a count). */
  badge?: string | number;
}

/** Minimal icon-component shape — matches a lucide-react icon. */
export type SidebarIconComponent = (props: {
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}) => ReactNode;
