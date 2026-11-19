import React from 'react';
import { render } from '@testing-library/react-native';

let mockViewportWidth = 402;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockViewportWidth, height: 1366, scale: 2, fontScale: 1 }),
}));

type ScreenOptions = Record<string, unknown>;
type DrawerContentRenderer = (props: unknown) => React.ReactElement;
const mockDrawer: {
  screenOptions: ScreenOptions;
  screens: Record<string, ScreenOptions>;
  drawerContent: DrawerContentRenderer | null;
} = {
  screenOptions: {},
  screens: {},
  drawerContent: null,
};

jest.mock('expo-router/drawer', () => {
  const Drawer = Object.assign(
    ({
      children,
      screenOptions,
      drawerContent,
    }: {
      children: React.ReactNode;
      screenOptions: ScreenOptions;
      drawerContent: DrawerContentRenderer;
    }) => {
      mockDrawer.screenOptions = screenOptions;
      mockDrawer.drawerContent = drawerContent;
      return children;
    },
    {
      Screen: ({ name, options }: { name: string; options: ScreenOptions }) => {
        mockDrawer.screens[name] = options;
        return null;
      },
    },
  );
  const { getDrawerStatusFromState } = jest.requireActual('expo-router/drawer');
  return { Drawer, getDrawerStatusFromState };
});

jest.mock('@/src/features/drawer/components/DrawerContent', () => ({ DrawerContent: () => null }));
jest.mock('@/src/features/continuity', () => ({ ContinuityOnboardingGate: () => null }));
jest.mock('@/src/features/auth/components/AppLockOffer', () => ({ AppLockOffer: () => null }));
jest.mock('@/src/features/device-registry', () => ({
  useDeviceRegistryHeartbeat: () => undefined,
}));
jest.mock('@/src/features/settings/account-security/WorkspaceMfaBanner', () => ({
  WorkspaceMfaBanner: () => null,
}));
jest.mock('@/src/features/release-state/releaseUpdateNotice', () => ({
  useReleaseUpdateNotice: () => undefined,
}));
jest.mock('@/src/features/service-notices/ServiceNoticesBanner', () => ({
  ServiceNoticesBanner: () => null,
}));
jest.mock('@/src/features/edge-cases/components/LocalDataResetNotice', () => ({
  LocalDataResetNotice: () => null,
}));
jest.mock('@/src/ui/theme', () => {
  const tokens = jest.requireActual('@/src/ui/theme/tokens');
  return { useThemeColors: () => tokens.lightColors };
});
jest.mock('../app/(app)/error', () => ({ __esModule: true, default: () => null }));

import AppLayout from '../app/(app)/_layout';

// The drawer reads drawerType, swipeEnabled and the edge width from the focused
// route's options merged over screenOptions.
function focusedOptions(name: string): ScreenOptions {
  return { ...mockDrawer.screenOptions, ...mockDrawer.screens[name] };
}

function layoutAt(width: number) {
  mockViewportWidth = width;
  mockDrawer.screens = {};
  render(<AppLayout />);
}

describe('full-screen routes beside the permanent sidebar', () => {
  it.each([1032, 1376])(
    'gives voice, scan and camera the whole %ipt window instead of the pane',
    (width) => {
      layoutAt(width);

      expect(focusedOptions('chat/[id]').drawerType).toBe('permanent');
      for (const name of ['voice', 'scan', 'camera']) {
        expect({ name, drawerType: focusedOptions(name).drawerType }).toEqual({
          name,
          drawerType: 'front',
        });
        expect({ name, swipeEnabled: focusedOptions(name).swipeEnabled }).toEqual({
          name,
          swipeEnabled: false,
        });
      }
    },
  );

  it.each([402, 820])(
    'leaves every route as it was at %ipt, where the drawer overlays',
    (width) => {
      layoutAt(width);

      for (const name of ['chat/[id]', 'voice', 'scan', 'camera']) {
        expect({ name, drawerType: focusedOptions(name).drawerType }).toEqual({
          name,
          drawerType: 'front',
        });
      }
      expect(focusedOptions('voice').swipeEnabled).toBe(false);
      expect(focusedOptions('scan').swipeEnabled).toBe(true);
      expect(focusedOptions('camera').swipeEnabled).toBe(true);
      expect(focusedOptions('chat/[id]').swipeEnabled).toBe(true);
    },
  );
});

describe('an overlay drawer left open when the sidebar becomes permanent', () => {
  function drawerProps(status: 'open' | 'closed', closeDrawer: jest.Mock) {
    return {
      state: {
        history:
          status === 'open'
            ? [
                { type: 'route', key: 'chat' },
                { type: 'drawer', status: 'open' },
              ]
            : [{ type: 'route', key: 'chat' }],
      },
      navigation: { closeDrawer },
    };
  }

  function drawerContentElement(props: ReturnType<typeof drawerProps>) {
    const drawerContent = mockDrawer.drawerContent;
    if (!drawerContent) throw new Error('AppLayout passed no drawerContent');
    return drawerContent(props);
  }

  function renderDrawerContent(props: ReturnType<typeof drawerProps>) {
    return render(drawerContentElement(props));
  }

  it('closes the open state once the window grows past the permanent-sidebar width', () => {
    const closeDrawer = jest.fn();
    layoutAt(820);
    const props = drawerProps('open', closeDrawer);
    const view = renderDrawerContent(props);
    expect(closeDrawer).not.toHaveBeenCalled();

    layoutAt(1032);
    view.rerender(drawerContentElement(props));

    expect(closeDrawer).toHaveBeenCalledTimes(1);
  });

  it.each([1032, 1376])('closes an open state it is handed at %ipt', (width) => {
    const closeDrawer = jest.fn();
    layoutAt(width);

    renderDrawerContent(drawerProps('open', closeDrawer));

    expect(closeDrawer).toHaveBeenCalledTimes(1);
  });

  it.each([402, 820])('leaves the overlay drawer open at %ipt', (width) => {
    const closeDrawer = jest.fn();
    layoutAt(width);

    renderDrawerContent(drawerProps('open', closeDrawer));

    expect(closeDrawer).not.toHaveBeenCalled();
  });

  it('does nothing beside the permanent sidebar when the drawer state is already closed', () => {
    const closeDrawer = jest.fn();
    layoutAt(1032);

    renderDrawerContent(drawerProps('closed', closeDrawer));

    expect(closeDrawer).not.toHaveBeenCalled();
  });
});
