import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

let mockBottomInset = 34;

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: mockBottomInset, left: 0 }),
}));

jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);

import { ActionMenuSheet } from '../src/features/conversation-actions';

const menu = {
  visible: true,
  title: 'Launch checklist',
  close: jest.fn(),
  actions: [
    { key: 'rename', label: 'Rename', run: jest.fn() },
    { key: 'delete', label: 'Delete', destructive: true, run: jest.fn() },
  ],
};

function sheetStyle(getByTestId: (id: string) => { props: { style?: unknown } }) {
  return StyleSheet.flatten(getByTestId('chat-actions-sheet').props.style as never);
}

describe('Chat action sheet position', () => {
  it('draws the sheet to the bottom edge and keeps the safe-area inset inside its own surface', () => {
    mockBottomInset = 34;
    const { getByTestId, getByLabelText } = render(<ActionMenuSheet menu={menu} />);

    const style = sheetStyle(getByTestId);
    expect(style.paddingBottom).toBe(8 + 34);
    expect(style.backgroundColor).toBeTruthy();
    expect(
      StyleSheet.flatten(getByLabelText('Dismiss chat actions').props.style).justifyContent,
    ).toBe('flex-end');
  });

  it('reads the inset from the app on every opening instead of measuring inside the modal', () => {
    mockBottomInset = 34;
    const first = render(<ActionMenuSheet menu={menu} />);
    expect(sheetStyle(first.getByTestId).paddingBottom).toBe(8 + 34);
    first.unmount();

    mockBottomInset = 20;
    const second = render(<ActionMenuSheet menu={menu} />);
    expect(sheetStyle(second.getByTestId).paddingBottom).toBe(8 + 20);
  });

  it('follows the inset on a device with no home indicator', () => {
    mockBottomInset = 0;
    const { getByTestId } = render(<ActionMenuSheet menu={menu} />);

    expect(sheetStyle(getByTestId).paddingBottom).toBe(8);
  });
});
