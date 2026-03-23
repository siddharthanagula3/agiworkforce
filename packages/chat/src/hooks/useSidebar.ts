import { useState, useCallback } from 'react';
import { tokens } from '../lib/tokens';

/**
 * Manages sidebar collapsed/expanded state.
 * Returns `collapsed`, `toggleSidebar`, and `width` for use in Sidebar.tsx.
 */
export function useSidebar() {
  const [collapsed, setCollapsed] = useState(false);

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const width = collapsed ? tokens.spacing.sidebarCollapsedWidth : tokens.spacing.sidebarWidth;

  return { collapsed, toggleSidebar, width };
}
