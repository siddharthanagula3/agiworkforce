/**
 * @agiworkforce/ui — cross-surface PURE UI: pure-presentation components and
 * plain config/contract data shared by web (apps/web) and desktop (apps/desktop).
 *
 * Boundary rule: ONLY pure presentation (no data/IO, currentColor SVG) and
 * config/contract (plain data) live here. Anything that imports a store, calls
 * invoke()/fetch(), or reads Next/RSC stays per-surface.
 */

export { ProviderMark, hasProviderMark } from './ProviderMark';
export { AgiMark } from './AgiMark';
export { cn } from './cn';
export {
  Sidebar,
  type SidebarProps,
  ProjectsView,
  type ProjectsViewProps,
  type ProjectViewProject,
  type ProjectViewConversation,
  type ProjectViewFile,
  SessionItem,
  type SessionItemProps,
  type SessionItemHandlers,
  SearchOverlay,
  type SearchOverlayProps,
  Menu,
  MenuItem,
  MenuSeparator,
  type MenuProps,
  type MenuItemProps,
  getTemporalGroup,
  TEMPORAL_LABELS,
  toSafeDate,
  type SidebarSession,
  type SidebarProject,
  type SidebarMode,
  type SidebarTemporalGroup,
  type SidebarNavItem,
  type SidebarIconComponent,
} from './sidebar';
export {
  SETTINGS_NAV,
  SETTINGS_NAV_GROUPS,
  type SettingsNavEntry,
  type SettingsNavGroup,
  type SettingsNavKey,
} from './settings-nav';
