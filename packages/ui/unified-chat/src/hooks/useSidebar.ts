import { useUIStore } from '../stores/uiStore';
import { tokens } from '../lib/tokens';

export function useSidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const width = collapsed ? tokens.spacing.sidebarCollapsedWidth : tokens.spacing.sidebarWidth;

  return { collapsed, toggleSidebar, width };
}
