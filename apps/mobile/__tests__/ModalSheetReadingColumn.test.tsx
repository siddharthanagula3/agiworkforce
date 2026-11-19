/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { sitsInColumn } from '../test-utils/sheetColumn';

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const builder = { duration: () => ({ springify: () => undefined }) };
  return {
    __esModule: true,
    default: { View: RN.View, createAnimatedComponent: (component: unknown) => component },
    FadeIn: builder,
    SlideInDown: builder,
    useReducedMotion: () => true,
  };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

import { ApprovalModal } from '../src/shared/components/ApprovalModal';
import { MessageEditModal } from '../src/features/chat/components/MessageEditModal';

describe('modal sheets on a wide window', () => {
  it('keeps the approval sheet in the reading column', () => {
    const { getByText } = render(
      <ApprovalModal
        approval={{
          id: 'a-1',
          toolName: 'Delete file',
          description: 'Remove the draft',
          riskLevel: 'high',
          type: 'file_delete',
          status: 'pending',
        }}
        onApprove={jest.fn()}
        onReject={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );

    expect(sitsInColumn(getByText('High Risk'), 'reading')).toBe(true);
  });

  it('dismisses the approval sheet from anywhere on the dimmed window, beside the sheet included', () => {
    const onDismiss = jest.fn();
    const { getByTestId } = render(
      <ApprovalModal
        approval={{
          id: 'a-2',
          toolName: 'Delete file',
          description: 'Remove the draft',
          riskLevel: 'high',
          type: 'file_delete',
          status: 'pending',
        }}
        onApprove={jest.fn()}
        onReject={jest.fn()}
        onDismiss={onDismiss}
      />,
    );

    const backdrop = getByTestId('approval-modal-backdrop');
    expect(StyleSheet.flatten(backdrop.props.style)).toMatchObject({
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });
    fireEvent.press(backdrop);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps the edit dialog in the reading column', () => {
    const { getByText } = render(
      <MessageEditModal
        visible
        text="Original"
        onChangeText={jest.fn()}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );

    expect(sitsInColumn(getByText('Edit Message'), 'reading')).toBe(true);
  });
});
