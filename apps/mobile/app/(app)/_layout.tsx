import { Drawer } from 'expo-router/drawer';
import { DrawerContent } from '@/src/features/drawer/components/DrawerContent';
import { ContinuityOnboardingGate } from '@/src/features/continuity';
import { AppLockOffer } from '@/src/features/auth/components/AppLockOffer';
import { useDeviceRegistryHeartbeat } from '@/src/features/device-registry';
import { useThemeColors } from '@/src/ui/theme';
import { useTabletLayout } from '@/src/shared/hooks/useTabletLayout';
import { drawerGestureOptions } from '@/src/features/shell';
import { WorkspaceMfaBanner } from '@/src/features/settings/account-security/WorkspaceMfaBanner';
import { useReleaseUpdateNotice } from '@/src/features/release-state/releaseUpdateNotice';
import { ServiceNoticesBanner } from '@/src/features/service-notices/ServiceNoticesBanner';

export { default as ErrorBoundary } from './error';

const HIDDEN = { drawerItemStyle: { display: 'none' as const } };
// The settings pages sit on a native stack whose edge swipe goes Back; the
// drawer's own edge swipe would claim the same drag.
const SETTINGS_STACK = { ...HIDDEN, swipeEnabled: false };

export default function AppLayout() {
  const colors = useThemeColors();
  const { drawerWidth, usesPersistentDrawer } = useTabletLayout();
  const gestures = drawerGestureOptions({ usesPersistentDrawer });
  useDeviceRegistryHeartbeat();
  useReleaseUpdateNotice();

  return (
    <>
      <Drawer
        backBehavior="history"
        drawerContent={(props) => <DrawerContent {...props} />}
        screenOptions={{
          headerShown: false,
          drawerType: gestures.drawerType,
          // The drawer container is animated on the UI thread. A style that changes with the theme
          // re-commits it on a Local/Cloud switch and resets its position, leaving a closed drawer
          // drawn open, so DrawerContent paints the themed background and border.
          drawerStyle: {
            width: drawerWidth,
            backgroundColor: colors.transparent,
            borderRightColor: colors.transparent,
            borderRightWidth: 0,
          },
          overlayColor: colors.scrim,
          swipeEnabled: gestures.swipeEnabled,
          swipeEdgeWidth: gestures.swipeEdgeWidth,
          swipeMinDistance: gestures.swipeMinDistance,
        }}
      >
        <Drawer.Screen name="index" options={HIDDEN} />

        <Drawer.Screen name="(tabs)" options={HIDDEN} />

        <Drawer.Screen name="chats/index" options={HIDDEN} />
        <Drawer.Screen name="search" options={HIDDEN} />
        <Drawer.Screen name="artifacts/index" options={HIDDEN} />
        <Drawer.Screen name="library/index" options={HIDDEN} />
        <Drawer.Screen name="connectors/index" options={HIDDEN} />
        <Drawer.Screen name="connectors/[id]" options={HIDDEN} />
        <Drawer.Screen name="connectors/oauth" options={HIDDEN} />
        <Drawer.Screen name="connectors/bank-complete" options={HIDDEN} />
        <Drawer.Screen name="github/installed" options={HIDDEN} />
        <Drawer.Screen name="continuity/index" options={HIDDEN} />
        <Drawer.Screen name="skills/index" options={HIDDEN} />
        <Drawer.Screen name="skills/[name]" options={HIDDEN} />
        <Drawer.Screen name="customize/index" options={HIDDEN} />
        <Drawer.Screen name="plugins/index" options={HIDDEN} />
        <Drawer.Screen name="plugins/[id]" options={HIDDEN} />
        <Drawer.Screen name="plugins/sources" options={HIDDEN} />
        <Drawer.Screen name="sites/index" options={HIDDEN} />
        <Drawer.Screen name="sites/[token]" options={HIDDEN} />
        <Drawer.Screen name="projects/notebook/[id]" options={HIDDEN} />
        <Drawer.Screen name="schedules/triggers/[id]" options={HIDDEN} />
        <Drawer.Screen name="reports/index" options={HIDDEN} />

        <Drawer.Screen name="chat/[id]" options={HIDDEN} />

        <Drawer.Screen name="projects/[id]" options={HIDDEN} />
        <Drawer.Screen name="projects/settings/[id]" options={HIDDEN} />
        <Drawer.Screen name="projects/shared/[id]" options={HIDDEN} />
        <Drawer.Screen name="study" options={HIDDEN} />
        <Drawer.Screen name="shared/index" options={HIDDEN} />

        <Drawer.Screen name="tasks" options={HIDDEN} />

        <Drawer.Screen name="companion/index" options={HIDDEN} />
        <Drawer.Screen name="companion/agent/[id]" options={HIDDEN} />
        <Drawer.Screen name="companion/code/[threadId]" options={HIDDEN} />
        <Drawer.Screen name="cloud-code/index" options={HIDDEN} />
        <Drawer.Screen name="cloud-code/[sessionId]" options={HIDDEN} />

        <Drawer.Screen name="profile/index" options={HIDDEN} />

        <Drawer.Screen name="schedules/index" options={HIDDEN} />
        <Drawer.Screen name="schedules/create" options={HIDDEN} />
        <Drawer.Screen name="schedules/runs" options={HIDDEN} />

        <Drawer.Screen name="settings" options={SETTINGS_STACK} />

        <Drawer.Screen name="notifications/index" options={HIDDEN} />

        <Drawer.Screen name="support/index" options={HIDDEN} />
        <Drawer.Screen name="support/[ticketId]" options={HIDDEN} />
        <Drawer.Screen name="feedback" options={HIDDEN} />
        <Drawer.Screen name="about" options={HIDDEN} />
        <Drawer.Screen name="camera" options={HIDDEN} />
        <Drawer.Screen name="compare" options={HIDDEN} />
        <Drawer.Screen name="scan" options={HIDDEN} />
        <Drawer.Screen name="translate" options={HIDDEN} />
        <Drawer.Screen name="voice" options={HIDDEN} />
        <Drawer.Screen name="widget-setup" options={HIDDEN} />
        <Drawer.Screen name="open/[target]/[id]" options={HIDDEN} />
      </Drawer>
      <ContinuityOnboardingGate />
      <WorkspaceMfaBanner />
      <ServiceNoticesBanner />
      <AppLockOffer />
    </>
  );
}
