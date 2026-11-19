/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockParams = { state: 'b'.repeat(64), code: 'auth-code' };
const mockRouter = { replace: mockReplace, back: jest.fn(), navigate: jest.fn() };
const mockComplete = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('@/services/connectors', () => ({
  completeConnectorAuthorization: (...args: unknown[]) => mockComplete(...args),
}));

import ConnectorOAuthReturnRoute from '../app/(app)/connectors/oauth';

describe('the connector sign-in return screen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    mockReplace.mockReset();
    mockComplete.mockReset();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('goes to the connector list without a notice when the connection finished', async () => {
    mockComplete.mockResolvedValue('connected');
    render(<ConnectorOAuthReturnRoute />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(app)/connectors'));
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('stays quiet when the sign-in was already finished by the other return path', async () => {
    mockComplete.mockResolvedValue('invalid_state');
    render(<ConnectorOAuthReturnRoute />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(app)/connectors'));
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('says nothing was connected when the person declined', async () => {
    mockComplete.mockResolvedValue('denied');
    render(<ConnectorOAuthReturnRoute />);
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(alertSpy.mock.calls[0][0]).toBe('Not connected');
    expect(mockReplace).toHaveBeenCalledWith('/(app)/connectors');
  });

  it('says nothing was connected when the sign-in failed', async () => {
    mockComplete.mockResolvedValue('failed');
    render(<ConnectorOAuthReturnRoute />);
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(alertSpy.mock.calls[0][0]).toBe('Could not finish connecting');
  });

  it('says nothing was connected when finishing the sign-in threw', async () => {
    mockComplete.mockRejectedValue(new Error('offline'));
    render(<ConnectorOAuthReturnRoute />);
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(alertSpy.mock.calls[0][0]).toBe('Could not finish connecting');
    expect(mockReplace).toHaveBeenCalledWith('/(app)/connectors');
  });
});
