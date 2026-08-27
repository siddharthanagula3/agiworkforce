import { Drawer } from 'expo-router/drawer';
import { DrawerContent } from '@/src/features/drawer/components/DrawerContent';
import { ContinuityOnboardingGate } from '@/src/features/continuity';
import { useThemeColors } from '@/src/ui/theme';
import { useResponsiveLayout } from '@/src/shared/hooks/useResponsiveLayout';

export { default as ErrorBoundary } from './error';

const HIDDEN = { drawerItemStyle: { display: 'none' as const } };

export default function AppLayout() {
  const colors = useThemeColors();
  const { drawerWidth, usesPersistentDrawer } = useResponsiveLayout();

  return (
    <>
      <Drawer
        drawerContent={(props) => <DrawerContent {...props} />}
        screenOptions={{
          headerShown: false,
          drawerType: usesPersistentDrawer ? 'permanent' : 'front',
          drawerStyle: {
            width: drawerWidth,
            backgroundColor: colors.background,
            borderRightColor: colors.border,
            borderRightWidth: 1,
          },
          overlayColor: colors.scrim,
          swipeEnabled: !usesPersistentDrawer,
          swipeEdgeWidth: 40,
        }}
      >
        {/* Redirect index */}
        <Drawer.Screen name="index" options={HIDDEN} />

        {/* Tab navigator (retained for route compatibility) */}
        <Drawer.Screen name="(tabs)" options={HIDDEN} />

        {/* New drawer-level routes */}
        <Drawer.Screen name="chats/index" options={HIDDEN} />
        <Drawer.Screen name="artifacts/index" options={HIDDEN} />
        <Drawer.Screen name="library/index" options={HIDDEN} />
        <Drawer.Screen name="connectors/index" options={HIDDEN} />
        <Drawer.Screen name="connectors/[id]" options={HIDDEN} />
        <Drawer.Screen name="continuity/index" options={HIDDEN} />
        <Drawer.Screen name="skills/index" options={HIDDEN} />

        {/* Chat detail */}
        <Drawer.Screen name="chat/[id]" options={HIDDEN} />

        {/* Project detail */}
        <Drawer.Screen name="projects/[id]" options={HIDDEN} />

        {/* Agent routes */}
        <Drawer.Screen name="tasks" options={HIDDEN} />
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
        <Drawer.Screen name="settings/account-security" options={HIDDEN} />
        <Drawer.Screen name="settings/memory" options={HIDDEN} />
        <Drawer.Screen name="settings/integrations" options={HIDDEN} />
        <Drawer.Screen name="settings/notifications" options={HIDDEN} />
        <Drawer.Screen name="settings/notifications/[category]" options={HIDDEN} />
        <Drawer.Screen name="settings/personalization" options={HIDDEN} />
        <Drawer.Screen name="settings/capabilities" options={HIDDEN} />
        <Drawer.Screen name="settings/auto-approve" options={HIDDEN} />
        <Drawer.Screen name="settings/app-language" options={HIDDEN} />

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
      <ContinuityOnboardingGate />
    </>
  );
}
