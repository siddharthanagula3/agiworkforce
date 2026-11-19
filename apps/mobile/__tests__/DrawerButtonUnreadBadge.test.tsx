/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();

let mockViewportWidth = 402;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockViewportWidth, height: 874, scale: 3, fontScale: 1 }),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy({}, { get: () => (props: Record<string, unknown>) => <RN.View {...props} /> });
});

jest.mock('../src/ui/theme', () => {
  const actual = jest.requireActual('../src/ui/theme/tokens');
  return { useThemeColors: () => actual.lightColors };
});

import { DrawerButton } from '../src/shared/components/DrawerButton';
import { notificationCenterStore } from '../services/notifications';

function pushNotification(id: string) {
  notificationCenterStore.add({
    request: {
      identifier: id,
      content: {
        title: `Task ${id}`,
        body: 'Finished in the background',
        data: { type: 'task_completed' },
      },
    },
  } as never);
}

describe('DrawerButton unread badge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notificationCenterStore.clear();
    mockViewportWidth = 402;
  });

  it('renders no badge while everything is read', () => {
    const { queryByTestId, getByLabelText } = render(<DrawerButton onPress={jest.fn()} />);

    expect(getByLabelText('Open navigation drawer')).toBeTruthy();
    expect(getByLabelText('Open navigation drawer')).toHaveStyle({ width: 44, height: 44 });
    expect(queryByTestId('drawer-unread-badge', { includeHiddenElements: true })).toBeNull();
  });

  it('renders the unread count once a background producer writes one', () => {
    const { getByTestId, getByText, rerender } = render(<DrawerButton onPress={jest.fn()} />);

    pushNotification('run-1');
    rerender(<DrawerButton onPress={jest.fn()} />);

    expect(getByTestId('drawer-unread-badge', { includeHiddenElements: true })).toBeTruthy();
    expect(getByText('1', { includeHiddenElements: true })).toBeTruthy();

    pushNotification('run-2');
    rerender(<DrawerButton onPress={jest.fn()} />);
    expect(getByText('2', { includeHiddenElements: true })).toBeTruthy();
  });

  it('reads the count as part of the drawer button and routes nowhere of its own', () => {
    const onPress = jest.fn();
    pushNotification('run-1');
    const { getByTestId, getByLabelText, queryByLabelText } = render(
      <DrawerButton onPress={onPress} />,
    );

    // The pip is 17pt at the corner of the drawer button. It cannot reach the 44pt
    // minimum without swallowing the drawer's taps, so it is an indicator.
    expect(queryByLabelText('1 unread notification')).toBeNull();
    expect(
      getByTestId('drawer-unread-badge', { includeHiddenElements: true }).props
        .accessibilityElementsHidden,
    ).toBe(true);

    fireEvent.press(getByLabelText('Open navigation drawer, 1 unread'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('drops back to no badge once everything is marked read', () => {
    pushNotification('run-1');
    const { queryByTestId, rerender } = render(<DrawerButton onPress={jest.fn()} />);
    expect(queryByTestId('drawer-unread-badge', { includeHiddenElements: true })).toBeTruthy();

    notificationCenterStore.markAllRead();
    rerender(<DrawerButton onPress={jest.fn()} />);

    expect(queryByTestId('drawer-unread-badge', { includeHiddenElements: true })).toBeNull();
  });
});

describe('DrawerButton beside the permanent sidebar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notificationCenterStore.clear();
  });

  it.each([402, 820, 999])('opens the drawer at %ipt, where the drawer overlays', (width) => {
    mockViewportWidth = width;
    const onPress = jest.fn();
    const { getByLabelText } = render(<DrawerButton onPress={onPress} />);

    fireEvent.press(getByLabelText('Open navigation drawer'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each([1000, 1032, 1376])(
    'offers no drawer button at %ipt but keeps its slot in the header',
    (width) => {
      mockViewportWidth = width;
      const { queryByLabelText, queryByRole, queryByTestId, root } = render(
        <DrawerButton testID="screen-open-drawer" onPress={jest.fn()} />,
      );

      expect(queryByLabelText(/Open navigation drawer/)).toBeNull();
      expect(queryByRole('button')).toBeNull();
      expect(queryByTestId('screen-open-drawer')).toBeNull();
      expect(root).toHaveStyle({ width: 44, height: 44 });
    },
  );

  it.each([1032, 1376])(
    'shows and speaks the unread count at %ipt and opens Notifications from it',
    (width) => {
      mockViewportWidth = width;
      pushNotification('run-1');
      pushNotification('run-2');
      const onPress = jest.fn();
      const { getByLabelText, getByText, queryByLabelText } = render(
        <DrawerButton onPress={onPress} />,
      );

      expect(queryByLabelText(/Open navigation drawer/)).toBeNull();
      expect(getByText('2', { includeHiddenElements: true })).toBeTruthy();
      const link = getByLabelText('Open notifications, 2 unread');
      expect(link).toHaveStyle({ width: 44, height: 44 });

      fireEvent.press(link);
      expect(mockPush).toHaveBeenCalledWith('/(app)/notifications');
      expect(onPress).not.toHaveBeenCalled();
    },
  );
});
