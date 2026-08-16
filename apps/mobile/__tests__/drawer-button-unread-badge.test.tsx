/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
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
  });

  it('renders no badge while everything is read', () => {
    const { queryByTestId, getByLabelText } = render(<DrawerButton onPress={jest.fn()} />);

    expect(getByLabelText('Open navigation drawer')).toBeTruthy();
    expect(queryByTestId('drawer-unread-badge')).toBeNull();
  });

  it('renders the unread count once a background producer writes one', () => {
    const { getByTestId, getByText, rerender } = render(<DrawerButton onPress={jest.fn()} />);

    pushNotification('run-1');
    rerender(<DrawerButton onPress={jest.fn()} />);

    expect(getByTestId('drawer-unread-badge')).toBeTruthy();
    expect(getByText('1')).toBeTruthy();

    pushNotification('run-2');
    rerender(<DrawerButton onPress={jest.fn()} />);
    expect(getByText('2')).toBeTruthy();
  });

  it('routes the badge to the notification centre, and the glyph to the drawer', () => {
    const onPress = jest.fn();
    pushNotification('run-1');
    const { getByTestId, getByLabelText } = render(<DrawerButton onPress={onPress} />);

    fireEvent.press(getByLabelText('1 unread notification'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(app)/notifications' });
    expect(onPress).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('drawer-unread-badge'));
    expect(mockPush).toHaveBeenCalledTimes(2);

    fireEvent.press(getByLabelText('Open navigation drawer'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it('drops back to no badge once everything is marked read', () => {
    pushNotification('run-1');
    const { queryByTestId, rerender } = render(<DrawerButton onPress={jest.fn()} />);
    expect(queryByTestId('drawer-unread-badge')).toBeTruthy();

    notificationCenterStore.markAllRead();
    rerender(<DrawerButton onPress={jest.fn()} />);

    expect(queryByTestId('drawer-unread-badge')).toBeNull();
  });
});
