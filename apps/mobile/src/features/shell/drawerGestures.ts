import { Platform } from 'react-native';
import { getDrawerStatusFromState, type DrawerContentComponentProps } from 'expo-router/drawer';

export const DRAWER_SWIPE_EDGE_WIDTH = 40;
// Android's system back gesture owns the outer band of the left edge and always
// wins, so the drawer's band has to reach past it to stay openable by swipe.
export const ANDROID_SYSTEM_BACK_EDGE_WIDTH = 24;
export const DRAWER_SWIPE_MIN_DISTANCE = 60;
// A horizontal scroller that starts at the edge shares the widened band, so
// Android asks for a longer drag before the drawer claims the gesture.
export const ANDROID_DRAWER_SWIPE_MIN_DISTANCE = 96;

export type ShellPlatform = typeof Platform.OS;

export interface DrawerGestureInput {
  usesPersistentDrawer: boolean;
  platform?: ShellPlatform;
}

export interface DrawerGestureOptions {
  drawerType: 'permanent' | 'front';
  swipeEnabled: boolean;
  swipeEdgeWidth: number;
  swipeMinDistance: number;
}

export function drawerGestureOptions({
  usesPersistentDrawer,
  platform = Platform.OS,
}: DrawerGestureInput): DrawerGestureOptions {
  const isAndroid = platform === 'android';
  const swipeMinDistance = isAndroid
    ? ANDROID_DRAWER_SWIPE_MIN_DISTANCE
    : DRAWER_SWIPE_MIN_DISTANCE;
  if (usesPersistentDrawer) {
    return { drawerType: 'permanent', swipeEnabled: false, swipeEdgeWidth: 0, swipeMinDistance };
  }
  return {
    drawerType: 'front',
    swipeEnabled: true,
    swipeEdgeWidth: isAndroid
      ? DRAWER_SWIPE_EDGE_WIDTH + ANDROID_SYSTEM_BACK_EDGE_WIDTH
      : DRAWER_SWIPE_EDGE_WIDTH,
    swipeMinDistance,
  };
}

type DrawerState = DrawerContentComponentProps['state'] | undefined;

export function isDrawerOpen(state: DrawerState): boolean {
  if (!state?.history) return false;
  return getDrawerStatusFromState(state) === 'open';
}
