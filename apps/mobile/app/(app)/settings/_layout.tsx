import { useEffect } from 'react';
import { Stack, useNavigation } from 'expo-router';
import { CommonActions, type NavigationState } from 'expo-router/react-navigation';
import { useTheme } from '@/src/ui/theme';

const SETTINGS_ROUTE = 'settings';
const SETTINGS_ROOT = 'index';

export const unstable_settings = { anchor: 'index' };

type DrawerRoute = NavigationState['routes'][number];

function showsOnlySettingsRoot(route: DrawerRoute | undefined): boolean {
  const routes = route?.state?.routes;
  return !routes || (routes.length === 1 && routes[0]?.name === SETTINGS_ROOT);
}

function keepSettingsRoot(route: DrawerRoute): DrawerRoute {
  const stack = route.state;
  if (stack?.stale !== false || stack.routes[0]?.name !== SETTINGS_ROOT) {
    return { key: route.key, name: route.name };
  }
  return {
    key: route.key,
    name: route.name,
    state: { ...stack, index: 0, routes: [stack.routes[0]] },
  };
}

function isInHistory(state: NavigationState | undefined, routeKey: string): boolean {
  return (
    state?.history?.some(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        'type' in entry &&
        entry.type === 'route' &&
        'key' in entry &&
        entry.key === routeKey,
    ) ?? false
  );
}

export default function SettingsLayout() {
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();

  // A settings page opened from a chat must go Back to that chat, so each visit
  // starts at the Settings page instead of the pages the last visit left behind.
  // While Back can still return to Settings, the Settings page keeps its route
  // key: a new key remounts it and loses its scroll position when a row opens a
  // screen outside this stack and comes back. Once Settings has left the drawer
  // history it was closed, so the route gets a new key: the drawer keeps a
  // visited screen mounted, and only a new key opens a fresh page at the top.
  useEffect(
    () =>
      navigation.addListener('blur', () => {
        const drawer = navigation.getState();
        const settings = drawer?.routes.find((route) => route.name === SETTINGS_ROUTE);
        if (!settings) return;
        const backReturnsHere = isInHistory(drawer, settings.key);
        if (backReturnsHere && showsOnlySettingsRoot(settings)) return;
        navigation.dispatch((state) =>
          CommonActions.reset({
            ...state,
            routes: state.routes.map((route): Omit<DrawerRoute, 'key'> => {
              if (route.name !== SETTINGS_ROUTE) return route;
              return backReturnsHere ? keepSettingsRoot(route) : { name: route.name };
            }),
          }),
        );
      }),
    [navigation],
  );

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: isDark ? colors.background : colors.surfaceBase },
      }}
    />
  );
}
