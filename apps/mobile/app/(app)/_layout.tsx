import { useWindowDimensions } from 'react-native';
import { Drawer } from 'expo-router/drawer';
import { DrawerContent } from '@/src/features/drawer/components/DrawerContent';
import { useThemeColors } from '@/src/ui/theme';

// Expo Router only wires up a route's error boundary when the route file
// itself has a named `ErrorBoundary` export — a separate ./error.tsx file is
// otherwise just an ordinary, unreachable screen. ./error.tsx already has
// the full retry / go-back UI matching this group's design system;
// re-export it here under the name Expo Router looks for so it actually
// fires for errors thrown anywhere inside the (app) drawer.
export { default as ErrorBoundary } from './error';

/**
 * App layout -- Drawer navigator wrapping the entire authenticated section.
 *
 * Navigation structure:
 *   Drawer (slide-out on iPhone, permanent sidebar on iPad)
 *     (tabs)/       -- Chat, Projects, Settings screens (retained for route compat)
 *     artifacts/    -- mobile artifact gallery
 *     library/      -- aggregated generated images + artifacts view
 *     code/         -- desktop/cloud code-session preview + handoff
 *     skills/       -- 150+ skill browser
 *     dispatch/     -- Desktop companion (Dispatch)
 *     connectors/   -- Service integrations
 *     chat/[id]     -- Full chat conversation (pushes on top)
 *     agents/[id]   -- Agent detail view
 *     companion/    -- QR pairing + desktop companion
 *     profile/      -- User profile
 *     schedules/    -- Schedule management
 *     settings/*    -- Settings sub-pages
 *     messaging/    -- External messaging
 *
 * The drawer replaces the previous bottom tab bar, giving more room
 * for the 6 nav items + recents list + user profile card.
 */

const HIDDEN = { drawerItemStyle: { display: 'none' as const } };

export default function AppLayout() {
  const { width } = useWindowDimensions();
  const colors = useThemeColors();
  const isTablet = width >= 768;

  return (
    <Drawer
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: isTablet ? 'permanent' : 'front',
        drawerStyle: {
          width: isTablet ? 280 : 300,
          backgroundColor: colors.background,
          borderRightColor: colors.border,
          borderRightWidth: 1,
        },
        overlayColor: colors.scrim,
        swipeEnabled: !isTablet,
        swipeEdgeWidth: 40,
      }}
    >
      {/* Redirect index */}
      <Drawer.Screen name="index" options={HIDDEN} />

      {/* Tab navigator (retained for route compatibility) */}
      <Drawer.Screen name="(tabs)" options={HIDDEN} />

      {/* New drawer-level routes */}
      <Drawer.Screen name="artifacts/index" options={HIDDEN} />
      <Drawer.Screen name="library/index" options={HIDDEN} />
      <Drawer.Screen name="code/index" options={HIDDEN} />
      <Drawer.Screen name="code/[id]" options={HIDDEN} />
      <Drawer.Screen name="code/archived" options={HIDDEN} />
      <Drawer.Screen name="skills/index" options={HIDDEN} />
      <Drawer.Screen name="dispatch/index" options={HIDDEN} />
      <Drawer.Screen name="connectors/index" options={HIDDEN} />

      {/* Chat detail */}
      <Drawer.Screen name="chat/[id]" options={HIDDEN} />

      {/* Project detail */}
      <Drawer.Screen name="projects/[id]" options={HIDDEN} />

      {/* Agent routes */}
      <Drawer.Screen name="agents/[id]" options={HIDDEN} />
      <Drawer.Screen name="agents/index" options={HIDDEN} />

      {/* Companion */}
      <Drawer.Screen name="companion/index" options={HIDDEN} />
      <Drawer.Screen name="companion/agent/[id]" options={HIDDEN} />

      {/* Profile */}
      <Drawer.Screen name="profile/index" options={HIDDEN} />

      {/* Schedules */}
      <Drawer.Screen name="schedules/index" options={HIDDEN} />
      <Drawer.Screen name="schedules/create" options={HIDDEN} />

      {/* Settings sub-pages */}
      <Drawer.Screen name="settings/index" options={HIDDEN} />
      <Drawer.Screen name="settings/memory" options={HIDDEN} />
      <Drawer.Screen name="settings/integrations" options={HIDDEN} />
      <Drawer.Screen name="settings/notifications" options={HIDDEN} />
      <Drawer.Screen name="settings/personalization" options={HIDDEN} />
      <Drawer.Screen name="settings/capabilities" options={HIDDEN} />
      <Drawer.Screen name="settings/auto-approve" options={HIDDEN} />

      {/* Messaging */}
      <Drawer.Screen name="messaging/index" options={HIDDEN} />

      {/* Notifications */}
      <Drawer.Screen name="notifications/index" options={HIDDEN} />

      {/* Standalone screens */}
      <Drawer.Screen name="feedback" options={HIDDEN} />
      <Drawer.Screen name="about" options={HIDDEN} />
      <Drawer.Screen name="camera" options={HIDDEN} />
      <Drawer.Screen name="compare" options={HIDDEN} />
      <Drawer.Screen name="scan" options={HIDDEN} />
      <Drawer.Screen name="translate" options={HIDDEN} />
      <Drawer.Screen name="voice" options={HIDDEN} />
      <Drawer.Screen name="widget-setup" options={HIDDEN} />
    </Drawer>
  );
}
