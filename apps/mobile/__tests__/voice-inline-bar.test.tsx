/**
 * Parity with references-2 voice-03 / voice-05, where voice is a state the chat
 * is IN rather than a screen you enter: the thread stays visible and only the
 * composer changes.
 *
 * What is pinned here is the control set and, more importantly, that exit and
 * mute are distinguishable. In the reference the exit is the one solid white
 * control on the bar; everything else is a dark pill. Collapsing those two —
 * or labelling them ambiguously — means a user trying to mute silently drops
 * out of voice, or worse, thinks they left while the mic is still live.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import {
  VoiceInlineBar,
  type VoiceInlinePhase,
} from '@/src/features/voice/components/VoiceInlineBar';
import { useSettingsStore } from '@/stores/settingsStore';

function renderBar(props: Partial<React.ComponentProps<typeof VoiceInlineBar>> = {}) {
  return render(
    <VoiceInlineBar
      visible
      phase={'idle' as VoiceInlinePhase}
      onToggleMic={jest.fn()}
      onExit={jest.fn()}
      {...props}
    />,
  );
}

describe('VoiceInlineBar', () => {
  beforeEach(() => {
    useSettingsStore.setState({ hapticsEnabled: false });
  });

  it('renders nothing when not visible', () => {
    const { queryByLabelText } = renderBar({ visible: false });
    expect(queryByLabelText('Exit voice mode')).toBeNull();
  });

  it('offers mic and exit as separate, distinctly labelled controls', () => {
    const { getByLabelText } = renderBar();
    getByLabelText('Unmute microphone');
    getByLabelText('Exit voice mode');
  });

  it('exits without toggling the mic', () => {
    // The confusion this guards: exit and mute sitting adjacent means wiring
    // them to the same handler is an easy mistake and a silent one.
    const onExit = jest.fn();
    const onToggleMic = jest.fn();
    const { getByLabelText } = renderBar({ onExit, onToggleMic });

    fireEvent.press(getByLabelText('Exit voice mode'));

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onToggleMic).not.toHaveBeenCalled();
  });

  it('toggles the mic without exiting', () => {
    const onExit = jest.fn();
    const onToggleMic = jest.fn();
    const { getByLabelText } = renderBar({ onExit, onToggleMic });

    fireEvent.press(getByLabelText('Unmute microphone'));

    expect(onToggleMic).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();
  });

  it('announces the mic as muteable while listening', () => {
    // The label has to track state, or a screen-reader user cannot tell whether
    // the microphone is currently open.
    const { getByLabelText } = renderBar({ phase: 'listening' });
    getByLabelText('Mute microphone');
  });

  it('keeps the attachment affordance the text composer has', () => {
    const onAttach = jest.fn();
    const { getByLabelText } = renderBar({ onAttach });
    fireEvent.press(getByLabelText('Add attachment'));
    expect(onAttach).toHaveBeenCalledTimes(1);
  });

  it('omits attachment entirely when the host provides no handler', () => {
    // Rendered dead, a "+" that does nothing reads as a bug.
    const { queryByLabelText } = renderBar();
    expect(queryByLabelText('Add attachment')).toBeNull();
  });
});
