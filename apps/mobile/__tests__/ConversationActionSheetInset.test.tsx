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

import { ActionMenuSheet, RenameConversationModal } from '../src/features/conversation-actions';
import {
  FORM_COLUMN_MAX_WIDTH,
  READING_COLUMN_MAX_WIDTH,
} from '../src/shared/layout/contentColumn';

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

  it('stops the sheet at the reading column on a tablet window instead of spanning it', () => {
    const { getByTestId } = render(<ActionMenuSheet menu={menu} />);

    expect(sheetStyle(getByTestId)).toMatchObject({
      width: '100%',
      maxWidth: READING_COLUMN_MAX_WIDTH,
      alignSelf: 'center',
    });
  });

  it('keeps the rename dialog at the form column on a tablet window', () => {
    const rename = {
      visible: true,
      conversationId: 'c-1',
      title: 'Launch checklist',
      text: 'Launch checklist',
      setText: jest.fn(),
      submit: jest.fn(),
      cancel: jest.fn(),
      menu: { ...menu, visible: false },
    };
    const { getByTestId } = render(<RenameConversationModal rename={rename} />);

    expect(StyleSheet.flatten(getByTestId('rename-chat-dialog').props.style)).toMatchObject({
      width: '100%',
      maxWidth: FORM_COLUMN_MAX_WIDTH,
      alignSelf: 'center',
    });
  });
});
