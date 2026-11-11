import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { MessageListRow } from '../MessageListRow';

const mockLayout = jest.fn();

jest.mock('@shopify/flash-list', () => ({
  useFlashListContext: () => ({ layout: mockLayout }),
}));

function layoutWithHeight(height: number) {
  fireEvent(screen.getByTestId('chat.message-row'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
  });
}

describe('MessageListRow', () => {
  beforeEach(() => mockLayout.mockClear());

  it('asks the list to lay out again when a message grows after its first measurement', () => {
    render(
      <MessageListRow messageId="m1">
        <Text>Diagram</Text>
      </MessageListRow>,
    );

    layoutWithHeight(220);
    expect(mockLayout).not.toHaveBeenCalled();

    layoutWithHeight(640);
    expect(mockLayout).toHaveBeenCalledTimes(1);

    layoutWithHeight(640);
    expect(mockLayout).toHaveBeenCalledTimes(1);
  });

  it('treats a recycled row showing another message as a first measurement', () => {
    const view = render(
      <MessageListRow messageId="m1">
        <Text>First</Text>
      </MessageListRow>,
    );
    layoutWithHeight(220);

    view.rerender(
      <MessageListRow messageId="m2">
        <Text>Second</Text>
      </MessageListRow>,
    );
    layoutWithHeight(480);

    expect(mockLayout).not.toHaveBeenCalled();
  });
});
