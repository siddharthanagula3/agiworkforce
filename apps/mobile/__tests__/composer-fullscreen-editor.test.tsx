/**
 * PAR-M05 — the composer's full-screen editor.
 *
 * The inline composer caps its field at ~6 lines, so the founder's pasted
 * several-hundred-character message ("when we paste large text in input area its
 * width goes very large and only the middle input") scrolls inside a small
 * window with no way to read it whole. The reference opens the message full
 * screen from a control pinned inside the composer card (IMG_0672).
 *
 * What is pinned here is that the editor is a VIEW, not a second draft: it holds
 * no text of its own, so nothing can diverge between the two surfaces. The
 * composer-side integration (when the control appears, and that the text round
 * trips) lives in chat-input.test.tsx, where the composer's own state is what
 * makes the assertion meaningful.
 */

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
    // Mounting it closed would put a second autoFocus field in the tree and
    // fight the inline composer for the keyboard.
    const { queryByTestId } = renderEditor({ visible: false });
    expect(queryByTestId('chat.composer.fullscreen.input')).toBeNull();
  });

  it('shows the composer text it was handed, whole', () => {
    const value = 'x'.repeat(800);
    const { getByTestId } = renderEditor({ value });

    const input = getByTestId('chat.composer.fullscreen.input');
    expect(input.props.value).toBe(value);
    // No height cap: the whole point is that the message is readable at once.
    expect(input.props.multiline).toBe(true);
    expect(input.props.style?.maxHeight).toBeUndefined();
  });

  it('owns no text state — every edit is reported upward', () => {
    const { getByTestId, onChangeText } = renderEditor({ value: 'before' });

    fireEvent.changeText(getByTestId('chat.composer.fullscreen.input'), 'after');

    expect(onChangeText).toHaveBeenCalledWith('after');
    // Still rendering the prop: the parent's state is the only copy.
    expect(getByTestId('chat.composer.fullscreen.input').props.value).toBe('before');
  });

  it('collapses without sending', () => {
    // Collapse and send sit next to each other; wiring them to the same
    // handler would fire a message the user only meant to keep editing.
    const { getByTestId, onClose, onSend } = renderEditor();

    fireEvent.press(getByTestId('chat.composer.fullscreen.collapse'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends without collapsing on its own', () => {
    const { getByLabelText, onClose, onSend } = renderEditor();

    fireEvent.press(getByLabelText('Send message'));

    expect(onSend).toHaveBeenCalledTimes(1);
    // The composer closes the editor as part of its send handler, so the
    // editor must not double-dismiss.
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
