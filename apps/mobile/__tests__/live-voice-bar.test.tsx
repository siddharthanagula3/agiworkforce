import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { LiveVoiceBar } from '@/src/features/voice/components/LiveVoiceBar';
import { VoiceInlineBar } from '@/src/features/voice/components/VoiceInlineBar';
import {
  LIVE_VOICE_LOCAL_MODE_REASON,
  LIVE_VOICE_MESSAGE,
} from '@/src/features/voice/services/liveVoiceAvailability';
import { useSettingsStore } from '@/stores/settingsStore';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderLiveBar(props: Partial<React.ComponentProps<typeof LiveVoiceBar>> = {}) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <LiveVoiceBar
        visible
        status="live"
        muted={false}
        assistantSpeaking={false}
        backendBusy={false}
        interrupted={false}
        turns={[]}
        error={null}
        onToggleMute={jest.fn()}
        onSwitchToText={jest.fn()}
        onRetry={jest.fn()}
        onExit={jest.fn()}
        {...props}
      />
    </SafeAreaProvider>,
  );
}

describe('LiveVoiceBar', () => {
  beforeEach(() => {
    useSettingsStore.setState({ hapticsEnabled: false });
  });

  it('renders nothing when it is not the active composer', () => {
    const { queryByTestId } = renderLiveBar({ visible: false });
    expect(queryByTestId('live-voice-bar')).toBeNull();
  });

  it('says it is connecting before the session starts', () => {
    const { getByTestId } = renderLiveBar({ status: 'connecting' });
    expect(getByTestId('live-voice-status').props.children).toBe('Connecting live voice...');
  });

  it('shows the denied microphone with a retry and a way back to the keyboard', () => {
    const onRetry = jest.fn();
    const onSwitchToText = jest.fn();
    const { getByTestId, getByLabelText } = renderLiveBar({
      status: 'error',
      error: LIVE_VOICE_MESSAGE.microphoneDenied,
      onRetry,
      onSwitchToText,
    });

    expect(getByTestId('live-voice-error')).toBeTruthy();
    fireEvent.press(getByTestId('live-voice-retry'));
    expect(onRetry).toHaveBeenCalled();
    fireEvent.press(getByLabelText('Type a message instead'));
    expect(onSwitchToText).toHaveBeenCalled();
  });

  it('tells the user they can talk over the assistant while it speaks', () => {
    const { getByTestId, rerender } = renderLiveBar({ assistantSpeaking: true });
    expect(getByTestId('live-voice-status').props.children).toBe(
      'Speaking, talk any time to interrupt',
    );

    rerender(
      <SafeAreaProvider initialMetrics={METRICS}>
        <LiveVoiceBar
          visible
          status="live"
          muted={false}
          assistantSpeaking={false}
          backendBusy={false}
          interrupted
          turns={[]}
          error={null}
          onToggleMute={jest.fn()}
          onSwitchToText={jest.fn()}
          onRetry={jest.fn()}
          onExit={jest.fn()}
        />
      </SafeAreaProvider>,
    );
    expect(getByTestId('live-voice-status').props.children).toBe('Go ahead');
  });

  it('shows both sides of the live transcript', () => {
    const { getByText } = renderLiveBar({
      turns: [
        { turnId: 'a', role: 'user', text: 'what is on my calendar', final: true },
        { turnId: 'b', role: 'assistant', text: 'Two meetings', final: false },
      ],
    });
    getByText('what is on my calendar');
    getByText('Two meetings');
    getByText('YOU');
    getByText('AGI');
  });

  it('shows the delegated backend as running work', () => {
    const { getByTestId, queryByTestId, rerender } = renderLiveBar({ backendBusy: true });
    expect(getByTestId('live-voice-activity')).toBeTruthy();

    rerender(
      <SafeAreaProvider initialMetrics={METRICS}>
        <LiveVoiceBar
          visible
          status="live"
          muted={false}
          assistantSpeaking={false}
          backendBusy={false}
          interrupted={false}
          turns={[]}
          error={null}
          onToggleMute={jest.fn()}
          onSwitchToText={jest.fn()}
          onRetry={jest.fn()}
          onExit={jest.fn()}
        />
      </SafeAreaProvider>,
    );
    expect(queryByTestId('live-voice-activity')).toBeNull();
  });

  it('keeps mute and end apart, and ending is not a mute', () => {
    const onToggleMute = jest.fn();
    const onExit = jest.fn();
    const { getByLabelText } = renderLiveBar({ muted: true, onToggleMute, onExit });

    fireEvent.press(getByLabelText('Unmute microphone'));
    expect(onToggleMute).toHaveBeenCalledTimes(1);
    fireEvent.press(getByLabelText('End live voice'));
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onToggleMute).toHaveBeenCalledTimes(1);
  });
});

describe('the turn-based fallback states why it is not live', () => {
  it('renders the reason above the bar', () => {
    const { getByTestId } = render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <VoiceInlineBar
          visible
          phase="idle"
          notice={LIVE_VOICE_LOCAL_MODE_REASON}
          onToggleMic={jest.fn()}
          onExit={jest.fn()}
        />
      </SafeAreaProvider>,
    );
    expect(getByTestId('voice-inline-notice').props.children).toBe(LIVE_VOICE_LOCAL_MODE_REASON);
  });

  it('renders no notice line when voice is live-capable', () => {
    const { queryByTestId } = render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <VoiceInlineBar visible phase="idle" onToggleMic={jest.fn()} onExit={jest.fn()} />
      </SafeAreaProvider>,
    );
    expect(queryByTestId('voice-inline-notice')).toBeNull();
  });
});
