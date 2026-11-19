import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { Modal, Platform, StyleSheet, type TextStyle } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

const ACTION_ROW = /^conversation-action-(?!cancel$)/;

export function openActionMenu(): ReactTestInstance {
  const sheets = screen.getAllByTestId('chat-actions-sheet');
  const sheet = sheets.at(-1);
  if (!sheet) throw new Error('No action menu is open');
  return sheet;
}

export function actionMenuTitle(): string {
  const title = within(openActionMenu()).getAllByText(/.*/)[0];
  return String(title?.props.children ?? '');
}

export function actionMenuMessage(): string | null {
  const message = within(openActionMenu()).queryByTestId('chat-actions-sheet-message');
  return message ? String(message.props.children ?? '') : null;
}

export function actionMenuLabels(): string[] {
  return within(openActionMenu())
    .getAllByTestId(ACTION_ROW)
    .map((row) => String(row.props.accessibilityLabel));
}

export function selectedActionMenuLabels(): string[] {
  return within(openActionMenu())
    .getAllByTestId(ACTION_ROW)
    .filter((row) => row.props.accessibilityState?.selected === true)
    .map((row) => String(row.props.accessibilityLabel));
}

export function isActionMenuOpen(): boolean {
  return screen.queryAllByTestId('chat-actions-sheet').length > 0;
}

export function actionMenuRowColor(label: string): TextStyle['color'] {
  const row = within(openActionMenu()).getByLabelText(label);
  return (StyleSheet.flatten(within(row).getByText(label).props.style) as TextStyle).color;
}

function modalAround(node: ReactTestInstance): ReactTestInstance {
  let current: ReactTestInstance | null = node;
  while (current && current.type !== Modal) current = current.parent;
  if (!current) throw new Error('The action menu is not inside a Modal');
  return current;
}

export function chooseActionMenuItem(label: string): void {
  const sheet = openActionMenu();
  const modal = modalAround(sheet);
  fireEvent.press(within(sheet).getByLabelText(label));
  if (Platform.OS === 'ios') {
    act(() => modal.props.onDismiss?.());
    return;
  }
  act(() => {
    jest.runOnlyPendingTimers();
  });
}

export function cancelActionMenu(): void {
  fireEvent.press(within(openActionMenu()).getByTestId('conversation-action-cancel'));
}
