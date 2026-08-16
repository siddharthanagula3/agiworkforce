
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { ComposerFullScreenEditor } from '@/src/features/chat/components/ComposerFullScreenEditor';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderEditor(props: Partial<React.ComponentProps<typeof ComposerFullScreenEditor>> = {}) {
  const onChangeText = jest.fn();
  const onClose = jest.fn();
  const onSend = jest.fn();
  const utils = render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ComposerFullScreenEditor
        visible
        value="the long pasted message"
        onChangeText={onChangeText}
        placeholder="What's on your mind?"
        sendState="idle"
        canSend
        onClose={onClose}
        onSend={onSend}
        {...props}
      />
    </SafeAreaProvider>,
  );
  return { onChangeText, onClose, onSend, ...utils };
}

describe('ComposerFullScreenEditor', () => {
  it('renders nothing while closed', () => {
    const { queryByTestId } = renderEditor({ visible: false });
    expect(queryByTestId('chat.composer.fullscreen.input')).toBeNull();
  });

  it('shows the composer text it was handed, whole', () => {
    const value = 'x'.repeat(800);
    const { getByTestId } = renderEditor({ value });

    const input = getByTestId('chat.composer.fullscreen.input');
    expect(input.props.value).toBe(value);
    expect(input.props.multiline).toBe(true);
    expect(input.props.style?.maxHeight).toBeUndefined();
  });

  it('owns no text state — every edit is reported upward', () => {
    const { getByTestId, onChangeText } = renderEditor({ value: 'before' });

    fireEvent.changeText(getByTestId('chat.composer.fullscreen.input'), 'after');

    expect(onChangeText).toHaveBeenCalledWith('after');
    expect(getByTestId('chat.composer.fullscreen.input').props.value).toBe('before');
  });

  it('collapses without sending', () => {
    const { getByTestId, onClose, onSend } = renderEditor();

    fireEvent.press(getByTestId('chat.composer.fullscreen.collapse'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends without collapsing on its own', () => {
    const { getByLabelText, onClose, onSend } = renderEditor();

    fireEvent.press(getByLabelText('Send message'));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('disables send when there is nothing to send', () => {
    const { getByLabelText } = renderEditor({ canSend: false });

    expect(getByLabelText('Send message')).toBeDisabled();
  });

  it('mirrors the composer control: stop while streaming', () => {
    const { getByLabelText, onSend } = renderEditor({ sendState: 'streaming' });

    const stop = getByLabelText('Stop generating');
    fireEvent.press(stop);

    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
