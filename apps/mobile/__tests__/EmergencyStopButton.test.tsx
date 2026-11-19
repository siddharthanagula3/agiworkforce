/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy({}, { get: () => (props: Record<string, unknown>) => <RN.View {...props} /> });
});

const mockSendEmergencyStop = jest.fn();
jest.mock('@/services/companion', () => ({
  EMERGENCY_STOP_NOT_SENT_MESSAGES: {
    unavailable: 'The stop did not reach your computer because it is not connected.',
    rejected: 'The stop could not be sent to your computer.',
  },
  sendEmergencyStop: () => mockSendEmergencyStop(),
}));

jest.mock('@/stores/connectionStore', () => {
  let status = 'connected';
  return {
    useConnectionStore: (selector: (state: { status: string }) => unknown) => selector({ status }),
    __setStatus: (next: string) => {
      status = next;
    },
  };
});

import {
  EMERGENCY_STOP_OFFLINE_NOTICE,
  EmergencyStopButton,
} from '../src/features/companion/components/EmergencyStopButton';

const connection = require('@/stores/connectionStore') as { __setStatus: (s: string) => void };

async function confirmStop(alert: jest.SpyInstance) {
  const confirm = alert.mock.calls[0]?.[2]?.find(
    (button: { text?: string }) => button.text === 'Stop Everything',
  );
  await act(async () => {
    confirm?.onPress?.();
  });
}

describe('EmergencyStopButton', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    connection.__setStatus('connected');
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => alert.mockRestore());

  it('stays quiet when the stop was sent', async () => {
    mockSendEmergencyStop.mockResolvedValue('sent');
    const { getByLabelText, queryByTestId } = render(<EmergencyStopButton />);

    fireEvent.press(getByLabelText('Emergency stop, cancel all running tasks'));
    await confirmStop(alert);

    expect(mockSendEmergencyStop).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(queryByTestId('emergency-stop-offline')).toBeNull();
  });

  it('tells the person the stop did not reach the computer when it is unavailable', async () => {
    mockSendEmergencyStop.mockResolvedValue('unavailable');
    const { getByLabelText } = render(<EmergencyStopButton />);

    fireEvent.press(getByLabelText('Emergency stop, cancel all running tasks'));
    await confirmStop(alert);

    expect(alert).toHaveBeenLastCalledWith(
      'Stop not sent',
      'The stop did not reach your computer because it is not connected.',
    );
  });

  it('tells the person the stop was refused when the transport rejects it', async () => {
    mockSendEmergencyStop.mockResolvedValue('rejected');
    const { getByLabelText } = render(<EmergencyStopButton />);

    fireEvent.press(getByLabelText('Emergency stop, cancel all running tasks'));
    await confirmStop(alert);

    expect(alert).toHaveBeenLastCalledWith(
      'Stop not sent',
      'The stop could not be sent to your computer.',
    );
  });

  it('says in place that a stop cannot reach a disconnected computer, and keeps the control', () => {
    connection.__setStatus('disconnected');
    const { getByTestId, getByLabelText } = render(<EmergencyStopButton />);

    expect(getByTestId('emergency-stop-offline')).toHaveTextContent(EMERGENCY_STOP_OFFLINE_NOTICE);
    expect(
      getByLabelText('Emergency stop, cancel all running tasks').props.accessibilityState?.disabled,
    ).not.toBe(true);
  });
});
