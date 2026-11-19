import React from 'react';
import { render } from '@testing-library/react-native';

const mockChatInput = jest.fn((_props: Record<string, unknown>) => null);

jest.mock('@/src/features/chat/components/ChatInput', () => ({
  ChatInput: (props: Record<string, unknown>) => mockChatInput(props),
}));

import { Composer } from '@/src/features/chat/components/Composer/Composer';

describe('Composer', () => {
  it('hands the typing and refused-send callbacks to the input so the thread can react', () => {
    const onHasTextChange = jest.fn();
    const onRefusedSendChange = jest.fn();

    render(
      <Composer
        onSend={jest.fn()}
        onHasTextChange={onHasTextChange}
        onRefusedSendChange={onRefusedSendChange}
      />,
    );

    const props = mockChatInput.mock.calls[0]![0];
    expect(props.onHasTextChange).toBe(onHasTextChange);
    expect(props.onRefusedSendChange).toBe(onRefusedSendChange);
  });
});
