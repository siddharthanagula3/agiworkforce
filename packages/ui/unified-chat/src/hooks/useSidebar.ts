import { useUIStore } from '../stores/uiStore';
import { tokens } from '../lib/tokens';

/**
 * Manages sidebar collapsed/expanded state via the shared UI store.
 * Returns `collapsed`, `toggleSidebar`, and `width` for use in Sidebar.tsx.
 */
export function useSidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const width = collapsed ? tokens.spacing.sidebarCollapsedWidth : tokens.spacing.sidebarWidth;

  return { collapsed, toggleSidebar, width };
}
