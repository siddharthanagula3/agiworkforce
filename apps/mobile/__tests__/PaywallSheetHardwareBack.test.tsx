/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { BackHandler } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

const mockClose = jest.fn();

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  const BottomSheet = React.forwardRef(
    (
      {
        children,
        onChange,
        onAnimate,
        onClose,
      }: {
        children: React.ReactNode;
        onChange?: (index: number) => void;
        onAnimate?: (fromIndex: number, toIndex: number) => void;
        onClose?: () => void;
      },
      ref: React.Ref<unknown>,
    ) => {
      React.useImperativeHandle(ref, () => ({ close: mockClose }));
      return (
        <View testID="bottom-sheet" onChange={onChange} onAnimate={onAnimate} onClose={onClose}>
          {children}
        </View>
      );
    },
  );
  BottomSheet.displayName = 'MockBottomSheet';
  const passThrough = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetBackdrop: () => null,
    BottomSheetView: passThrough,
  };
});

jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return { ...actual, useThemeColors: () => actual.lightColors };
});

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/lib/safeOpenURL', () => ({ openExternalUrl: jest.fn().mockResolvedValue(true) }));

jest.mock('@/src/features/billing/webBillingLinks', () => ({
  useWebBillingLinksAllowed: () => false,
}));

import { PaywallBottomSheet } from '@/src/features/chat/components/PaywallBottomSheet';

const props = {
  feature: 'token_cap',
  requiredTier: 'basic',
  reason: '2M tokens used this month',
};

describe('PaywallBottomSheet hardware back', () => {
  let remove: jest.Mock;
  let add: jest.SpyInstance;

  beforeEach(() => {
    mockClose.mockClear();
    remove = jest.fn();
    add = jest.spyOn(BackHandler, 'addEventListener').mockImplementation(() => ({ remove }));
  });

  afterEach(() => {
    add.mockRestore();
  });

  it('answers Back from the first frame of the opening slide and closes the sheet', () => {
    const view = render(<PaywallBottomSheet {...props} onDismiss={jest.fn()} />);
    expect(add).not.toHaveBeenCalled();

    fireEvent(view.getByTestId('bottom-sheet'), 'animate', -1, 0);
    const handler = add.mock.calls.at(-1)?.[1] as () => boolean;

    expect(add).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
    expect(handler()).toBe(true);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('lets Back through once the sheet has closed, and still tells the parent', () => {
    const onDismiss = jest.fn();
    const view = render(<PaywallBottomSheet {...props} onDismiss={onDismiss} />);

    fireEvent(view.getByTestId('bottom-sheet'), 'change', 0);
    expect(add).toHaveBeenCalledTimes(1);

    fireEvent(view.getByTestId('bottom-sheet'), 'change', -1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('lets go of Back when the opening is closed before it settles', () => {
    const view = render(<PaywallBottomSheet {...props} onDismiss={jest.fn()} />);

    fireEvent(view.getByTestId('bottom-sheet'), 'animate', -1, 0);
    fireEvent(view.getByTestId('bottom-sheet'), 'close');

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
