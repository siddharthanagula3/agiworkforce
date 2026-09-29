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
        approvals={[]}
        toolActivity={[]}
        toolOutcomes={[]}
        onDecideApproval={jest.fn()}
        onToggleMute={jest.fn()}
        onStopTask={jest.fn()}
        reconnecting={false}
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
          approvals={[]}
          toolActivity={[]}
          toolOutcomes={[]}
          onDecideApproval={jest.fn()}
          onToggleMute={jest.fn()}
          onStopTask={jest.fn()}
          reconnecting={false}
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
          approvals={[]}
          toolActivity={[]}
          toolOutcomes={[]}
          onDecideApproval={jest.fn()}
          onToggleMute={jest.fn()}
          onStopTask={jest.fn()}
          reconnecting={false}
          onSwitchToText={jest.fn()}
          onRetry={jest.fn()}
          onExit={jest.fn()}
        />
      </SafeAreaProvider>,
    );
    expect(queryByTestId('live-voice-activity')).toBeNull();
  });

  it('names the running tool and says when it is slow', () => {
    const { getByText, queryByText } = renderLiveBar({
      backendBusy: true,
      toolActivity: [
        {
          delegationId: 'del_1',
          toolId: 'calendar',
          label: 'Checking your calendar',
          state: 'running',
          startedAt: 0,
        },
        {
          delegationId: 'del_2',
          toolId: 'web_search',
          label: 'Searching the web',
          state: 'timed_out',
          startedAt: 0,
        },
      ],
    });
    getByText('Checking your calendar');
    getByText('Searching the web is taking longer than usual');
    expect(queryByText('Working on your request')).toBeNull();
  });

  it('shows what the actions returned, and marks one that failed', () => {
    const { getAllByTestId, getByText } = renderLiveBar({
      toolOutcomes: [
        {
          callId: 'a',
          label: 'Checking your calendar',
          output: 'Two meetings today',
          isError: false,
        },
        {
          callId: 'b',
          label: 'Sending the email',
          output: 'The mailbox refused it',
          isError: true,
        },
      ],
    });
    expect(getAllByTestId('live-voice-tool-result')).toHaveLength(2);
    getByText('What the actions returned');
    getByText('Two meetings today');
    getByText('Sending the email · Did not complete');
  });

  it('sends the on-screen approval decision for that call', () => {
    const onDecideApproval = jest.fn();
    const { getByTestId } = renderLiveBar({
      onDecideApproval,
      approvals: [
        {
          callId: 'call_1',
          name: 'gmail_send',
          summary: 'Send an email to Sam',
          input: null,
          deciding: false,
        },
      ],
    });
    fireEvent.press(getByTestId('live-voice-deny'));
    expect(onDecideApproval).toHaveBeenCalledWith('call_1', 'rejected');
    fireEvent.press(getByTestId('live-voice-approve'));
    expect(onDecideApproval).toHaveBeenCalledWith('call_1', 'approved');
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
