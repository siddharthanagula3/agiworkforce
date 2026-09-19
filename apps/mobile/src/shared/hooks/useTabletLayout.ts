import { useWindowDimensions } from 'react-native';
import { getResponsiveLayout, type ResponsiveLayout } from './useResponsiveLayout';

export const TABLET_MIN_WIDTH = 768;
export const REGULAR_MIN_WIDTH = 1024;

export type ShellOrientation = 'portrait' | 'landscape';
export type ShellSizeClass = 'compact' | 'tablet' | 'regular';

export interface TabletLayout extends ResponsiveLayout {
  viewportHeight: number;
  orientation: ShellOrientation;
  sizeClass: ShellSizeClass;
  isTablet: boolean;
  isSplitView: boolean;
}

export function getTabletLayout(viewportWidth: number, viewportHeight: number): TabletLayout {
  const base = getResponsiveLayout(viewportWidth);
  const safeViewportHeight = Math.max(0, viewportHeight);
  const orientation: ShellOrientation =
    base.viewportWidth >= safeViewportHeight ? 'landscape' : 'portrait';
  const sizeClass: ShellSizeClass =
    base.viewportWidth >= REGULAR_MIN_WIDTH
      ? 'regular'
      : base.viewportWidth >= TABLET_MIN_WIDTH
        ? 'tablet'
        : 'compact';
  // A tablet in split view reports a phone-sized width on a tablet-sized
  // screen, so the long edge is what says the device is a tablet at all.
  const longestEdge = Math.max(base.viewportWidth, safeViewportHeight);
  const isSplitView = sizeClass !== 'regular' && longestEdge >= REGULAR_MIN_WIDTH;

  return {
    ...base,
    viewportHeight: safeViewportHeight,
    orientation,
    sizeClass,
    isTablet: longestEdge >= REGULAR_MIN_WIDTH,
    isSplitView,
  };
}

export function useTabletLayout(): TabletLayout {
  const { width, height } = useWindowDimensions();
  return getTabletLayout(width, height);
}
