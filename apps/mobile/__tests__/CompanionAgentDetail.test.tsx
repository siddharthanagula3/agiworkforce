/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

jest.mock('react-native-webrtc', () => ({
  RTCPeerConnection: jest.fn(),
  RTCSessionDescription: jest.fn(),
  RTCIceCandidate: jest.fn(),
}));

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  }),
  useLocalSearchParams: () => ({ id: 'agent-1' }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: (props: Record<string, unknown>) => <View {...props} /> };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy({}, { get: () => (props: Record<string, unknown>) => <RN.View {...props} /> });
});

jest.mock('@/src/features/companion/components/AgentDashboard', () => ({
  ToolCallLog: () => null,
  ProgressBar: () => null,
  getTimeElapsed: () => '1m',
  estimateTimeRemaining: () => null,
}));

const mockSendAgentCommand = jest.fn();
jest.mock('@/services/companion', () => ({
  AGENT_COMMAND_NOT_SENT_MESSAGES: {
    unavailable: 'Your computer is not connected, so the command was not sent.',
    rejected: 'The command could not be sent to your computer.',
  },
  sendAgentCommand: (...args: unknown[]) => mockSendAgentCommand(...args),
  requestAgentRefresh: jest.fn(),
}));

import AgentDetailScreen from '../app/(app)/companion/agent/[id]';
import { useAgentStore } from '../stores/agentStore';
import { useConnectionStore } from '../stores/connectionStore';

function runningAgent() {
  return {
    id: 'agent-1',
    name: 'Release notes',
    model: 'auto',
    status: 'running' as const,
    currentStep: 'Drafting',
    progress: 40,
    steps: [],
    toolCalls: [],
    startedAt: '2026-11-10T10:00:00.000Z',
    updatedAt: '2026-11-10T10:05:00.000Z',
  };
}

describe('companion agent detail controls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAgentStore.setState({ agents: [runningAgent()] });
    useConnectionStore.setState({ status: 'connected' });
  });

  it('sends a pause while the computer is connected', async () => {
    mockSendAgentCommand.mockResolvedValue('sent');
    const { getByLabelText, queryByTestId } = render(<AgentDetailScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Pause agent'));
    });

    expect(mockSendAgentCommand).toHaveBeenCalledWith('agent-1', 'pause');
    expect(queryByTestId('agent-controls-offline')).toBeNull();
  });

  it('disables the controls and offers a reconnect once the connection is lost', async () => {
    useConnectionStore.setState({ status: 'disconnected' });
    const { getByLabelText, getByTestId } = render(<AgentDetailScreen />);

    expect(getByTestId('agent-controls-offline')).toBeTruthy();
    expect(getByLabelText('Pause agent').props.accessibilityState.disabled).toBe(true);
    expect(getByLabelText('Cancel agent').props.accessibilityState.disabled).toBe(true);

    fireEvent.press(getByLabelText('Reconnect to your computer'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/companion');
  });

  it('says so when a command is not delivered instead of failing silently', async () => {
    mockSendAgentCommand.mockResolvedValue('unavailable');
    const { getByLabelText, findByText } = render(<AgentDetailScreen />);

    await act(async () => {
      fireEvent.press(getByLabelText('Pause agent'));
    });

    expect(
      await findByText('Your computer is not connected, so the command was not sent.'),
    ).toBeTruthy();
  });

  it('reports a rejected cancel after the user confirms it', async () => {
    mockSendAgentCommand.mockResolvedValue('rejected');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByLabelText, findByText } = render(<AgentDetailScreen />);

    fireEvent.press(getByLabelText('Cancel agent'));
    const confirm = alert.mock.lastCall?.[2]?.find((button) => button.text === 'Cancel Task');
    await act(async () => {
      confirm?.onPress?.();
    });

    expect(mockSendAgentCommand).toHaveBeenCalledWith('agent-1', 'cancel');
    expect(await findByText('The command could not be sent to your computer.')).toBeTruthy();
    alert.mockRestore();
  });
});
