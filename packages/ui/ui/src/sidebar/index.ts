export {
  Sidebar,
  MOBILE_NAV_DRAWER_WIDTH,
  OPEN_SEARCH_SHORTCUT,
  openSearchShortcutLabel,
  type SidebarProps,
} from './Sidebar';
export { SessionItem, type SessionItemProps, type SessionItemHandlers } from './SessionItem';
export { Menu, MenuItem, MenuSeparator, type MenuProps, type MenuItemProps } from './Menu';
export {
  isInlineEditActive,
  isMenuPanelOpen,
  isTransientSidebarLayerOpen,
  keepOpenForMenuEscape,
  INLINE_EDIT_ATTRIBUTE,
  MENU_PANEL_ATTRIBUTE,
} from './escape-guard';
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
