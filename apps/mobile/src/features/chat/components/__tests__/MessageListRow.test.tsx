import { act, fireEvent, render, screen } from '@testing-library/react-native';
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

function nextFrame() {
  act(() => {
    jest.runOnlyPendingTimers();
  });
}

describe('MessageListRow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockLayout.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('asks the list to lay out again when a settled message grows after its first measurement', () => {
    render(
      <MessageListRow messageId="m1" streaming={false}>
        <Text>Diagram</Text>
      </MessageListRow>,
    );

    layoutWithHeight(220);
    nextFrame();
    expect(mockLayout).not.toHaveBeenCalled();

    layoutWithHeight(640);
    nextFrame();
    expect(mockLayout).toHaveBeenCalledTimes(1);

    layoutWithHeight(640);
    nextFrame();
    expect(mockLayout).toHaveBeenCalledTimes(1);
  });

  it('leaves a streaming message to the list, which re-measures it on every update anyway', () => {
    render(
      <MessageListRow messageId="m1" streaming>
        <Text>Streaming</Text>
      </MessageListRow>,
    );

    for (const height of [40, 80, 120, 160, 200]) layoutWithHeight(height);
    nextFrame();

    expect(mockLayout).not.toHaveBeenCalled();
  });

  it('coalesces several growth steps in one frame into a single layout pass', () => {
    render(
      <MessageListRow messageId="m1" streaming={false}>
        <Text>Image</Text>
      </MessageListRow>,
    );
    layoutWithHeight(100);

    layoutWithHeight(200);
    layoutWithHeight(300);
    layoutWithHeight(400);
    nextFrame();

    expect(mockLayout).toHaveBeenCalledTimes(1);
  });

  it('treats a recycled row showing another message as a first measurement', () => {
    const view = render(
      <MessageListRow messageId="m1" streaming={false}>
        <Text>First</Text>
      </MessageListRow>,
    );
    layoutWithHeight(220);

    view.rerender(
      <MessageListRow messageId="m2" streaming={false}>
        <Text>Second</Text>
      </MessageListRow>,
    );
    layoutWithHeight(480);
    nextFrame();

    expect(mockLayout).not.toHaveBeenCalled();
  });
});
