/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import {
  Alert,
  StyleSheet,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';

const themeColors = {
  successSurface: '#031',
  successBorder: '#052',
  warningSurface: '#310',
  warningBorder: '#520',
  dangerSurface: '#300',
  dangerBorder: '#500',
  agentWarning: '#fa0',
  neutralBorder: '#333',
  textSecondary: '#aaa',
  textPrimary: '#fff',
  textMuted: '#777',
  agentSuccess: '#0f0',
  agentError: '#f00',
  agentActive: '#00f',
  teal: '#2dd4bf',
  neutralSurface: '#222',
};

type TreeNode = {
  props: {
    className?: string;
    style?: StyleProp<ViewStyle>;
    onLayout?: (event: LayoutChangeEvent) => void;
  };
  parent: TreeNode | null;
};

function ancestorWith(node: TreeNode | null | undefined, prop: string): TreeNode {
  let current = node?.parent ?? null;
  while (current && current.props[prop as keyof TreeNode['props']] === undefined)
    current = current.parent;
  if (!current) throw new Error(`no ancestor with ${prop}`);
  return current;
}

jest.mock('@/src/ui/theme', () => ({
  useThemeColors: () => themeColors,
}));

jest.mock('@/components/ui/Text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  return { Text };
});

jest.mock('@/components/ui/Card', () => {
  const RN = require('react-native');
  return { Card: ({ children }: { children: React.ReactNode }) => <RN.View>{children}</RN.View> };
});

jest.mock('@/components/ui/Separator', () => ({ Separator: () => null }));

jest.mock('@/components/ui/PressableBox', () => {
  const RN = require('react-native');
  return { PressableBox: RN.Pressable };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const factory = () => () => <RN.View />;
  return new Proxy({}, { get: (_t, name: string) => (name === '__esModule' ? true : factory()) });
});

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
}));

const mockGetCalendarStatus = jest.fn();
jest.mock('@/src/features/integrations/services/deviceIntegrations', () => ({
  getCalendarPermissionStatus: () => mockGetCalendarStatus(),
}));

const mockGetNotificationPermissions = jest.fn();
jest.mock('expo-notifications', () => ({
  __esModule: true,
  getPermissionsAsync: () => mockGetNotificationPermissions(),
}));

const mockRequestCalendar = jest.fn();
const mockRequestNotifications = jest.fn();
jest.mock('@/src/features/settings/permissions/registry', () => ({
  PERMISSION_REGISTRY: {
    calendar: { requestPermission: () => mockRequestCalendar() },
    notifications: { requestPermission: () => mockRequestNotifications() },
  },
}));

import { TextScaleContext } from '@/components/ui/textScale';
import {
  HEADER_TEXT_SCALE_LIMIT,
  ROW_LABEL_TEXT_SCALE_LIMIT,
  STACKED_ROW_TEXT_SCALE,
} from '@/src/ui/theme/tokens';
import { DeviceIntegrationStatus } from '@/src/features/integrations/components/DeviceIntegrationStatus';

describe('DeviceIntegrationStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCalendarStatus.mockResolvedValue('undetermined');
    mockGetNotificationPermissions.mockResolvedValue({ status: 'undetermined' });
    mockRequestCalendar.mockResolvedValue('granted');
    mockRequestNotifications.mockResolvedValue('granted');
  });

  it('does not request any permission when it mounts', async () => {
    const screen = render(<DeviceIntegrationStatus />);
    await screen.findByText('Device Access');

    expect(mockRequestCalendar).not.toHaveBeenCalled();
    expect(mockRequestNotifications).not.toHaveBeenCalled();
  });

  it('asks the system for an undetermined permission instead of pointing at Settings', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(<DeviceIntegrationStatus />);
    await screen.findByText('Device Access');

    mockGetNotificationPermissions.mockResolvedValue({ status: 'granted' });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Notifications: Inactive'));
    });

    expect(mockRequestNotifications).toHaveBeenCalledTimes(1);
    expect(mockRequestCalendar).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText('Notifications: Active')).toBeTruthy());
    alert.mockRestore();
  });

  it('reports a finished request to the screen so its own cards can re-read', async () => {
    const onPermissionChange = jest.fn();
    const screen = render(<DeviceIntegrationStatus onPermissionChange={onPermissionChange} />);
    await screen.findByText('Device Access');

    await act(async () => {
      fireEvent.press(screen.getByLabelText(/Calendar: Inactive/));
    });

    expect(mockRequestCalendar).toHaveBeenCalledTimes(1);
    expect(onPermissionChange).toHaveBeenCalledTimes(1);
  });

  it('still offers Settings for a permission the person already refused', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockGetNotificationPermissions.mockResolvedValue({ status: 'denied' });
    const screen = render(<DeviceIntegrationStatus />);
    await screen.findByText('Device Access');

    fireEvent.press(screen.getByLabelText('Notifications: Needs Permission'));

    expect(mockRequestNotifications).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it('re-reads permission state when the screen reports a change', async () => {
    const screen = render(<DeviceIntegrationStatus refreshKey="undetermined" />);
    await screen.findByText('Device Access');
    expect(screen.getByLabelText(/Calendar: Inactive/)).toBeTruthy();

    mockGetCalendarStatus.mockResolvedValue('granted');
    screen.rerender(<DeviceIntegrationStatus refreshKey="granted" />);

    await waitFor(() => expect(screen.getByLabelText(/Calendar: Active/)).toBeTruthy());
  });

  describe.each([1, 3.571])('at text scale %s', (scale) => {
    const renderAtScale = async () => {
      mockGetCalendarStatus.mockResolvedValue('denied');
      const screen = render(
        <TextScaleContext.Provider value={scale}>
          <DeviceIntegrationStatus />
        </TextScaleContext.Provider>,
      );
      await screen.findByText('Device Access');
      return screen;
    };

    it('lets the row wrap and keeps whole words in the text column', async () => {
      const screen = await renderAtScale();
      const text = screen.getByText(/Schedule context for AI/);
      const row = ancestorWith(text, 'accessibilityLabel');
      if (scale >= STACKED_ROW_TEXT_SCALE) {
        expect(row.props.className).not.toContain('flex-wrap');
        expect(row.props.className).not.toContain('flex-row');
        const column = screen.getByTestId('device-integration-text-calendar');
        expect(within(column).getByText(/Schedule context for AI/)).toBe(text);
        for (let node = text.parent; node && node !== row; node = node.parent) {
          expect(node.props.className ?? '').not.toContain('flex-row');
          expect(StyleSheet.flatten(node.props.style)?.flexDirection).not.toBe('row');
        }
        expect(within(column).queryByText('Apple Calendar')).toBeNull();
        const name = screen.getByText('Apple Calendar');
        expect(name.props.maxFontSizeMultiplier).toBe(ROW_LABEL_TEXT_SCALE_LIMIT);
        expect(StyleSheet.flatten(name.props.style).flexShrink).toBe(1);
        const nameColumn = ancestorWith(name, 'className');
        expect(StyleSheet.flatten(nameColumn.props.style)).toMatchObject({ flex: 1, minWidth: 0 });
        const badgeBox = within(column).getByTestId('device-integration-badge-calendar');
        expect(within(badgeBox).getByText('Needs Permission')).toBeTruthy();
        expect(StyleSheet.flatten(badgeBox.props.style).alignSelf).toBe('flex-start');
        expect(badgeBox.props.onLayout).toBeUndefined();
        return;
      }
      expect(row.props.className).toContain('flex-wrap');

      const column = ancestorWith(text, 'onLayout');
      const style = StyleSheet.flatten(column.props.style);
      expect(style).toMatchObject({ flexGrow: 1, flexShrink: 1, flexBasis: 0 });
      expect(style.minWidth).toBeGreaterThan(0);
    });

    it('caps the Device Access title and lets it shrink beside its badge', async () => {
      const screen = await renderAtScale();
      const title = screen.getByText('Device Access');

      expect(title.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
      expect(StyleSheet.flatten(title.props.style).flexShrink).toBe(1);
      expect(ancestorWith(title, 'className').props.className).toContain('flex-wrap');
    });

    it('caps the status badge text at the header limit', async () => {
      const screen = await renderAtScale();
      expect(screen.getAllByText('Needs Permission')[0].props.maxFontSizeMultiplier).toBe(
        HEADER_TEXT_SCALE_LIMIT,
      );
    });
  });

  it('indents a badge that wrapped onto its own line so it lines up under the text', async () => {
    mockGetCalendarStatus.mockResolvedValue('denied');
    const screen = render(<DeviceIntegrationStatus />);
    await screen.findByText('Device Access');
    const column = ancestorWith(screen.getByText(/Schedule context for AI/), 'onLayout');
    const badgeBox = ancestorWith(screen.getAllByText('Needs Permission')[0], 'onLayout');
    const marginOf = () => StyleSheet.flatten(badgeBox.props.style)?.marginLeft;

    act(() => {
      column.props.onLayout?.({
        nativeEvent: { layout: { x: 48, y: 12, width: 200, height: 60 } },
      } as LayoutChangeEvent);
      badgeBox.props.onLayout?.({
        nativeEvent: { layout: { x: 252, y: 30, width: 140, height: 24 } },
      } as LayoutChangeEvent);
    });
    expect(marginOf()).toBeUndefined();

    act(() => {
      badgeBox.props.onLayout?.({
        nativeEvent: { layout: { x: 0, y: 84, width: 140, height: 24 } },
      } as LayoutChangeEvent);
    });
    expect(marginOf()).toBe(48);
  });
});
