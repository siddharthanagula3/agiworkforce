import { useWindowDimensions } from 'react-native';

export const PERSISTENT_DRAWER_WIDTH = 280;
export const OVERLAY_DRAWER_MAX_WIDTH = 300;
export const MAX_GRID_CONTENT_WIDTH = 920;

const PERSISTENT_DRAWER_MIN_CONTENT_WIDTH = 720;
const THREE_COLUMN_MIN_CONTENT_WIDTH = 700;
const TWO_COLUMN_MIN_CONTENT_WIDTH = 360;
const OVERLAY_DRAWER_VIEWPORT_FRACTION = 0.88;

export interface ResponsiveLayout {
  viewportWidth: number;
  contentWidth: number;
  drawerWidth: number;
  usesPersistentDrawer: boolean;
  gridColumns: 1 | 2 | 3;
}

export function getResponsiveLayout(viewportWidth: number): ResponsiveLayout {
  const safeViewportWidth = Math.max(0, viewportWidth);
  const usesPersistentDrawer =
    safeViewportWidth >= PERSISTENT_DRAWER_WIDTH + PERSISTENT_DRAWER_MIN_CONTENT_WIDTH;
  const drawerWidth = usesPersistentDrawer
    ? PERSISTENT_DRAWER_WIDTH
    : Math.min(
        OVERLAY_DRAWER_MAX_WIDTH,
        Math.round(safeViewportWidth * OVERLAY_DRAWER_VIEWPORT_FRACTION),
      );
  const contentWidth = Math.max(
    0,
    safeViewportWidth - (usesPersistentDrawer ? PERSISTENT_DRAWER_WIDTH : 0),
  );
  const gridColumns =
    contentWidth >= THREE_COLUMN_MIN_CONTENT_WIDTH
      ? 3
      : contentWidth >= TWO_COLUMN_MIN_CONTENT_WIDTH
        ? 2
        : 1;

  return {
    viewportWidth: safeViewportWidth,
    contentWidth,
    drawerWidth,
    usesPersistentDrawer,
    gridColumns,
  };
}

export function useResponsiveLayout(): ResponsiveLayout {
  const { width } = useWindowDimensions();
  return getResponsiveLayout(width);
}
