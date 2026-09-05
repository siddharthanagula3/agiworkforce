export { Sidebar, type SidebarProps } from './Sidebar';
export { SessionItem, type SessionItemProps, type SessionItemHandlers } from './SessionItem';
export { SearchOverlay, type SearchOverlayProps } from './SearchOverlay';
export {
  Menu,
  MenuItem,
  MenuSeparator,
  isMenuPanelOpen,
  keepOpenForMenuEscape,
  type MenuProps,
  type MenuItemProps,
} from './Menu';
export { getTemporalGroup, TEMPORAL_LABELS, toSafeDate } from './temporal';
export {
  PROJECT_ICON_REGISTRY,
  DEFAULT_PROJECT_ICON_ID,
  resolveProjectIcon,
  hasKnownProjectIcon,
  PROJECT_ACCENT_REGISTRY,
  DEFAULT_PROJECT_ACCENT_ID,
  resolveProjectAccentHex,
  nearestProjectAccentId,
  type ProjectIconEntry,
  type ProjectAccentEntry,
} from './project-icons';
export type {
  SidebarSession,
  SidebarProject,
  SidebarMode,
  SidebarTemporalGroup,
  SidebarNavItem,
  SidebarIconComponent,
} from './types';
