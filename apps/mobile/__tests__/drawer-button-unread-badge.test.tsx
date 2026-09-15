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

    // The pip is 17pt at the corner of a 36pt button. It cannot reach the 44pt
    // minimum without swallowing the drawer's taps, so it is an indicator and
    // Notifications has its own drawer row.
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
