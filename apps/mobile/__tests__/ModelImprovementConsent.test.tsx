import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH } from '@agiworkforce/cloud-contracts';

const mockFetch = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<ReactModule>('react');
    useEffect(() => {
      const cleanup = callback();
      return typeof cleanup === 'function' ? cleanup : undefined;
    }, [callback]);
  },
}));
jest.mock('@/services/api', () => ({
  apiFetch: (...args: unknown[]) => mockFetch(...args),
}));
jest.mock('@/src/features/auth/store', () => {
  const { create } = jest.requireActual<ZustandModule>('zustand');
  return {
    useAuthStore: create(() => ({
      isClerkLoaded: true,
      isClerkSignedIn: true,
      clerkUserId: 'account-a',
    })),
  };
});
jest.mock('@/src/features/chat/store/appModeStore', () => {
  const { create } = jest.requireActual<ZustandModule>('zustand');
  return { useChatAppModeStore: create(() => ({ appMode: 'cloud' })) };
});
jest.mock('@/src/features/settings/Common', () => {
  const { Switch } = jest.requireActual<ReactNativeModule>('react-native');
  return {
    SettingsGroup: ({ children }: { children: React.ReactNode }) => children,
    SettingsSwitchRow: ({
      label,
      description,
      ...props
    }: {
      label: string;
      description?: string;
    }) => <Switch accessibilityLabel={label} accessibilityHint={description} {...props} />,
  };
});
jest.mock('@/components/ui/Button', () => {
  const { Pressable, Text } = jest.requireActual<ReactNativeModule>('react-native');
  return {
    Button: ({ title, ...props }: { title: string }) => (
      <Pressable {...props}>
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});
jest.mock('lucide-react-native', () => ({
  EyeOff: () => null,
  MessageSquare: () => null,
  Mic: () => null,
}));

import { TrainingPreferenceGroups } from '@/src/features/settings/cloud-privacy/TrainingPreferenceGroups';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  activateCloudAccount,
  captureCloudAccountEpoch,
  __resetCloudAccountSessionForTests,
} from '@/src/features/auth/services/cloudAccountSession';

const CHATS = 'Use my chats';
const VOICE = 'Use my voice';
const PROVIDER = 'Only use models that do not train on your chats';

const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn().mockResolvedValue(body),
});
const stored = (privacy: Record<string, boolean>, version = 'stored-revision') =>
  response({ settings: privacy, version });
const receipt = (privacy: Record<string, boolean>) =>
  response({ settings: { privacy }, version: 'saved-revision' });
const putCalls = () => mockFetch.mock.calls.filter((call) => call[1]?.method === 'PUT');

beforeEach(() => {
  mockFetch.mockReset();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('account-a');
  useAuthStore.setState({ clerkUserId: 'account-a', isClerkLoaded: true, isClerkSignedIn: true });
  useChatAppModeStore.setState({ appMode: 'cloud' });
  mockFetch.mockResolvedValue(stored({}));
});

async function readyScreen() {
  const screen = render(<TrainingPreferenceGroups />);
  await waitFor(() => expect(screen.getByLabelText(CHATS).props.disabled).toBe(false));
  return screen;
}

describe('model improvement choices on Cloud Privacy', () => {
  it('shows both choices off under their own heading, apart from the provider switch', async () => {
    const screen = await readyScreen();
    expect(screen.getByText('Help improve AGI models')).toBeTruthy();
    expect(screen.getByText('Model training')).toBeTruthy();
    expect(screen.getByLabelText(CHATS).props.value).toBe(false);
    expect(screen.getByLabelText(VOICE).props.value).toBe(false);
    expect(screen.getByLabelText(CHATS).props.accessibilityHint).toBe(
      'Allow AGI to use your chats to improve its own models.',
    );
    expect(screen.getByLabelText(VOICE).props.accessibilityHint).toBe(
      'Allow AGI to use your voice recordings to improve its own models.',
    );
    expect(screen.getByText(/Nothing is used for this today\./)).toBeTruthy();
    expect(screen.getByLabelText(PROVIDER).props.value).toBe(false);
  });

  it('saves the chat choice alone with the stored revision and shows it on', async () => {
    const screen = await readyScreen();
    mockFetch
      .mockResolvedValueOnce(receipt({ allowChatsForModelImprovement: true }))
      .mockResolvedValueOnce(stored({ allowChatsForModelImprovement: true }, 'saved-revision'));
    fireEvent(screen.getByLabelText(CHATS), 'valueChange', true);
    expect(putCalls()[0]?.[0]).toBe(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH);
    expect(JSON.parse(putCalls()[0]?.[1].body)).toEqual({
      namespace: 'privacy',
      patch: { allowChatsForModelImprovement: true },
      expectedVersion: 'stored-revision',
    });
    expect(putCalls()[0]?.[2]).toEqual({
      accountEpoch: captureCloudAccountEpoch(),
      signal: expect.any(AbortSignal),
    });
    await waitFor(() => expect(screen.getByLabelText(CHATS).props.value).toBe(true));
    expect(screen.getByLabelText(VOICE).props.value).toBe(false);
    expect(screen.getByLabelText(PROVIDER).props.value).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reports an unconfirmed voice save and shows the stored choice', async () => {
    const screen = await readyScreen();
    mockFetch
      .mockRejectedValueOnce(new Error('lost response'))
      .mockResolvedValueOnce(stored({ allowVoiceForModelImprovement: false }));
    fireEvent(screen.getByLabelText(VOICE), 'valueChange', true);
    await waitFor(() => expect(screen.getByText(/The save could not be confirmed/)).toBeTruthy());
    expect(screen.getByLabelText(VOICE).props.value).toBe(false);
    expect(screen.getByLabelText(VOICE).props.disabled).toBe(false);
    expect(putCalls()).toHaveLength(1);
  });

  it('keeps an acknowledged choice visible when the readback fails and retries only the read', async () => {
    const screen = await readyScreen();
    mockFetch
      .mockResolvedValueOnce(receipt({ allowChatsForModelImprovement: true }))
      .mockRejectedValueOnce(new Error('read failed'));
    fireEvent(screen.getByLabelText(CHATS), 'valueChange', true);
    await waitFor(() =>
      expect(screen.getByText(/Your chat improvement setting was saved as on, but/)).toBeTruthy(),
    );
    expect(screen.getByLabelText(CHATS).props.value).toBe(true);
    expect(screen.getByLabelText(CHATS).props.disabled).toBe(true);
    mockFetch.mockResolvedValueOnce(stored({ allowChatsForModelImprovement: true }));
    fireEvent.press(screen.getByLabelText('Retry loading model training settings'));
    await waitFor(() => expect(screen.getByLabelText(CHATS).props.disabled).toBe(false));
    expect(putCalls()).toHaveLength(1);
  });

  it('asks for a fresh choice after a change elsewhere', async () => {
    const screen = await readyScreen();
    mockFetch
      .mockResolvedValueOnce(response({}, 412))
      .mockResolvedValueOnce(stored({ allowVoiceForModelImprovement: true }, 'newer-revision'));
    fireEvent(screen.getByLabelText(VOICE), 'valueChange', false);
    await waitFor(() => expect(screen.getByText(/Your settings changed elsewhere/)).toBeTruthy());
    expect(screen.getByLabelText(VOICE).props.value).toBe(true);
  });

  it('does not read or save in Local mode', async () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    const screen = render(<TrainingPreferenceGroups />);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.getByLabelText(CHATS).props.disabled).toBe(true);
    expect(screen.getByLabelText(VOICE).props.disabled).toBe(true);
    fireEvent(screen.getByLabelText(CHATS), 'valueChange', true);
    expect(putCalls()).toHaveLength(0);
  });

  it("shows the new account's choices after an account switch, not the previous one's", async () => {
    mockFetch.mockResolvedValueOnce(stored({ allowChatsForModelImprovement: true }));
    const screen = render(<TrainingPreferenceGroups />);
    await waitFor(() => expect(screen.getByLabelText(CHATS).props.value).toBe(true));
    mockFetch.mockResolvedValueOnce(stored({}, 'account-b-revision'));
    act(() => {
      activateCloudAccount('account-b');
      useAuthStore.setState({ clerkUserId: 'account-b' });
    });
    expect(screen.getByLabelText(CHATS).props.value).toBe(false);
    await waitFor(() => expect(screen.getByLabelText(CHATS).props.disabled).toBe(false));
    expect(screen.getByLabelText(CHATS).props.value).toBe(false);
    expect(mockFetch.mock.calls.at(-1)?.[2].accountEpoch).toEqual(captureCloudAccountEpoch());
  });
});

type ReactModule = typeof import('react');
type ZustandModule = typeof import('zustand');
type ReactNativeModule = typeof import('react-native');
