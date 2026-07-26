import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

jest.mock('../lib/mmkv', () => ({
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

let mockAppMode: 'local' | 'cloud' = 'cloud';
jest.mock('@/src/features/chat/store/appModeStore', () => {
  const store = (selector: (state: { appMode: 'local' | 'cloud' }) => unknown) =>
    selector({ appMode: mockAppMode });
  store.getState = () => ({ appMode: mockAppMode });
  return { useChatAppModeStore: store };
});

let mockClerkUserId: string | null = 'account-a';
jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (state: { clerkUserId: string | null }) => unknown) =>
    selector({ clerkUserId: mockClerkUserId }),
}));

jest.mock('@/src/ui/theme', () => ({
  useThemeColors: () => ({
    surfaceBase: '#111111',
    surfaceElevated: '#222222',
    border: '#333333',
    textPrimary: '#ffffff',
    textMuted: '#999999',
    teal: '#008080',
  }),
}));

const mockAddCustomConnector = jest.fn();
jest.mock('@/services/connectors', () => ({
  addCustomConnector: (...args: unknown[]) => mockAddCustomConnector(...args),
}));

import { AddCustomConnectorModal } from '../src/features/settings/cloud-connectors/AddCustomConnectorModal';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

describe('AddCustomConnectorModal account isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('account-a');
    mockAppMode = 'cloud';
    mockClerkUserId = 'account-a';
  });

  it('clears account-A fields and ignores its late create response after account B activates', async () => {
    let resolveAccountA!: (value: {
      id: string;
      shortId: string;
      name: string;
      url: string;
    }) => void;
    mockAddCustomConnector.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAccountA = resolve;
      }),
    );
    const onClose = jest.fn();
    const onAdded = jest.fn();
    const screen = render(<AddCustomConnectorModal visible onClose={onClose} onAdded={onAdded} />);

    fireEvent.changeText(screen.getByLabelText('Connector name'), 'Account A tools');
    fireEvent.changeText(
      screen.getByLabelText('Connector URL'),
      'https://account-a.example.com/sse',
    );
    fireEvent.changeText(screen.getByLabelText('Auth token (optional)'), 'account-a-secret');
    fireEvent.press(screen.getByLabelText('Add connector'));
    expect(mockAddCustomConnector).toHaveBeenCalledWith({
      name: 'Account A tools',
      url: 'https://account-a.example.com/sse',
      authToken: 'account-a-secret',
    });

    act(() => {
      activateCloudAccount('account-b');
      mockClerkUserId = 'account-b';
      screen.rerender(<AddCustomConnectorModal visible onClose={onClose} onAdded={onAdded} />);
    });

    expect(screen.getByLabelText('Connector name').props.value).toBe('');
    expect(screen.getByLabelText('Connector URL').props.value).toBe('');
    expect(screen.getByLabelText('Auth token (optional)').props.value).toBe('');
    expect(onClose).toHaveBeenCalled();

    await act(async () => {
      resolveAccountA({
        id: 'account-a-row',
        shortId: 'account-a-short',
        name: 'Account A tools',
        url: 'https://account-a.example.com/sse',
      });
      await Promise.resolve();
    });

    expect(onAdded).not.toHaveBeenCalled();
  });
});
