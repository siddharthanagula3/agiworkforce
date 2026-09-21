import { useEffect, useState } from 'react';
import { Dimensions, useWindowDimensions, type ScaledSize } from 'react-native';
import { getResponsiveLayout, type ResponsiveLayout } from './useResponsiveLayout';

export const TABLET_MIN_WIDTH = 768;
export const REGULAR_MIN_WIDTH = 1024;

// A window one point narrower than the screen is rounding, not multitasking.
const SPLIT_VIEW_MIN_INSET = 8;

export type ShellOrientation = 'portrait' | 'landscape';
export type ShellSizeClass = 'compact' | 'tablet' | 'regular';

export interface ShellMetrics {
  width: number;
  height: number;
}

export interface TabletLayout extends ResponsiveLayout {
  viewportHeight: number;
  orientation: ShellOrientation;
  sizeClass: ShellSizeClass;
  isTablet: boolean;
  isSplitView: boolean;
}

// Split View, Slide Over, Stage Manager and Android split screen all hand the
// app a phone-sized window on a tablet-sized screen, so only the pair tells.
export function getTabletLayout(window: ShellMetrics, screen: ShellMetrics = window): TabletLayout {
  const base = getResponsiveLayout(window.width);
  const viewportHeight = Math.max(0, window.height);
  const screenWidth = Math.max(0, screen.width);
  const screenHeight = Math.max(0, screen.height);
  const orientation: ShellOrientation =
    base.viewportWidth >= viewportHeight ? 'landscape' : 'portrait';
  const sizeClass: ShellSizeClass =
    base.viewportWidth >= REGULAR_MIN_WIDTH
      ? 'regular'
      : base.viewportWidth >= TABLET_MIN_WIDTH
        ? 'tablet'
        : 'compact';
  const isTablet = Math.max(screenWidth, screenHeight) >= REGULAR_MIN_WIDTH;

  return {
    ...base,
    viewportHeight,
    orientation,
    sizeClass,
    isTablet,
    isSplitView: isTablet && base.viewportWidth <= screenWidth - SPLIT_VIEW_MIN_INSET,
  };
}

function useScreenDimensions(): ScaledSize {
  const [screen, setScreen] = useState(() => Dimensions.get('screen'));
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ screen: next }) => {
      setScreen(next);
    });
    return () => subscription.remove();
  }, []);
  return screen;
}

export function useTabletLayout(): TabletLayout {
  const window = useWindowDimensions();
  const screen = useScreenDimensions();
  return getTabletLayout(window, screen);
}
