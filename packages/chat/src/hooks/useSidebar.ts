import { useMemo } from 'react';
import { useUIStore } from '../stores/uiStore';
import { tokens } from '../lib/tokens';

export function useSidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const width = useUIStore((s) => s.sidebarWidth);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);

  const currentWidth = collapsed ? tokens.sidebar.collapsedWidth : width;

  return useMemo(
    () => ({
      collapsed,
      width: currentWidth,
      expandedWidth: width,
      toggleSidebar,
      setSidebarCollapsed,
      setSidebarWidth,
    }),
    [collapsed, currentWidth, width, toggleSidebar, setSidebarCollapsed, setSidebarWidth],
  );
}
