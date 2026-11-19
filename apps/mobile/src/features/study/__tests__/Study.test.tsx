/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@/services/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
  apiFetch: jest.fn(),
}));

const mockFocus = (() => {
  let focused = true;
  const listeners = new Set<() => void>();
  return {
    get: () => focused,
    set: (next: boolean) => {
      focused = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
})();

jest.mock('expo-router', () => {
  const React = require('react');
  const { expoRouterMock } = require('@/__mocks__/expo-router.mock');
  return expoRouterMock({
    useFocusEffect: (effect: () => void | (() => void)) => {
      const focused = React.useSyncExternalStore(mockFocus.subscribe, mockFocus.get);
      React.useEffect(() => (focused ? effect() : undefined), [effect, focused]);
    },
  });
});

const mockCreateConversation = jest.fn();
jest.mock('@/stores/chatStore', () => ({
  useChatStore: (
    selector: (state: { createConversation: typeof mockCreateConversation }) => unknown,
  ) => selector({ createConversation: mockCreateConversation }),
}));

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { api, apiFetch } from '@/services/api';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { StudyScreen } from '@/src/features/study/StudyScreen';
import { useModelStore } from '@/src/features/model-picker/store';
import { useTierStore } from '@/src/features/billing/store';
import { requireMobileCloudModel } from '@/test-utils/modelFixtures';
import { StudyModeBanner, STUDY_MODE_OFF_NOTE } from '@/src/features/study/StudyModeBanner';

const CONVERSATION_ID = '0190a000-0000-7000-8000-000000000071';

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 's-1',
    conversationId: CONVERSATION_ID,
    topic: 'Spanish past tense',
    mode: 'practice',
    level: 'beginner',
    startedAt: '2026-10-19T08:00:00.000Z',
    endedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  act(() => mockFocus.set(true));
  useChatAppModeStore.setState({ appMode: 'cloud' });
  (api.get as jest.Mock).mockResolvedValue({ sessions: [] });
});

describe('StudyScreen', () => {
  it('starts a practice session in a new Cloud chat and opens it', async () => {
    mockCreateConversation.mockResolvedValue(CONVERSATION_ID);
    (api.post as jest.Mock).mockResolvedValue({ session: session() });
    render(<StudyScreen />);

    fireEvent.changeText(screen.getByTestId('study-topic'), '  Spanish past tense ');
    fireEvent.press(screen.getByTestId('study-mode-practice'));
    fireEvent.press(screen.getByTestId('study-start'));

    await waitFor(() =>
      expect(useRouter().replace).toHaveBeenCalledWith({
        pathname: '/(app)/chat/[id]',
        params: { id: CONVERSATION_ID },
      }),
    );
    expect(mockCreateConversation).toHaveBeenCalledWith('Practise it: Spanish past tense');
    expect(api.post).toHaveBeenCalledWith('/api/study/sessions', {
      conversationId: CONVERSATION_ID,
      topic: 'Spanish past tense',
      mode: 'practice',
      level: 'beginner',
    });
  });

  it('starts the study chat on the new-chat model, not one shown only for a project', async () => {
    const projectModel = requireMobileCloudModel().id;
    const ownModel = requireMobileCloudModel((model) => model.id !== projectModel).id;
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'max', billingTier: 'max' });
    useModelStore.setState({
      selectedModel: projectModel,
      selectedProvider: 'cloud_managed',
      newChatModels: { local: null, cloud: ownModel },
      newChatModelOwner: null,
      conversationModelShown: true,
    });
    let modelWhenCreated: string | undefined;
    mockCreateConversation.mockImplementation(async () => {
      modelWhenCreated = useModelStore.getState().selectedModel;
      return CONVERSATION_ID;
    });
    (api.post as jest.Mock).mockResolvedValue({ session: session() });
    render(<StudyScreen />);

    fireEvent.changeText(screen.getByTestId('study-topic'), 'Photosynthesis');
    fireEvent.press(screen.getByTestId('study-start'));

    await waitFor(() => expect(mockCreateConversation).toHaveBeenCalled());
    expect(modelWhenCreated).toBe(ownModel);
    expect(useModelStore.getState().conversationModelShown).toBe(false);
  });

  it('shows an empty form that can start another session once the first has started', async () => {
    mockCreateConversation.mockResolvedValue(CONVERSATION_ID);
    (api.post as jest.Mock).mockResolvedValue({ session: session() });
    render(<StudyScreen />);

    fireEvent.changeText(screen.getByTestId('study-topic'), 'Photosynthesis');
    fireEvent.press(screen.getByTestId('study-mode-practice'));
    fireEvent.press(screen.getByTestId('study-start'));
    await waitFor(() => expect(useRouter().replace).toHaveBeenCalled());

    await waitFor(() => expect(screen.getByTestId('study-topic').props.value).toBe(''));
    expect(screen.getByTestId('study-start').props.accessibilityState.busy).toBe(false);
    expect(screen.getByTestId('study-mode-learn').props.accessibilityState.selected).toBe(true);

    fireEvent.changeText(screen.getByTestId('study-topic'), 'Cell division');
    fireEvent.press(screen.getByTestId('study-start'));
    await waitFor(() => expect(mockCreateConversation).toHaveBeenCalledTimes(2));
    expect(mockCreateConversation).toHaveBeenLastCalledWith('Learn it: Cell division');
  });

  it('clears the form and reloads the recent sessions each time the screen gains focus', async () => {
    render(<StudyScreen />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    fireEvent.changeText(screen.getByTestId('study-topic'), 'Old topic');
    expect(screen.queryByText('RECENT')).toBeNull();

    (api.get as jest.Mock).mockResolvedValue({
      sessions: [
        session({ id: 's-active', topic: 'Spanish past tense' }),
        session({
          id: 's-done',
          conversationId: '0190a000-0000-7000-8000-000000000072',
          topic: 'Photosynthesis',
          endedAt: '2026-10-19T09:00:00.000Z',
        }),
      ],
    });
    act(() => mockFocus.set(false));
    act(() => mockFocus.set(true));

    expect(await screen.findByText('Spanish past tense')).toBeTruthy();
    expect(screen.getByText('Photosynthesis')).toBeTruthy();
    expect(screen.getByText('Practise it · ended')).toBeTruthy();
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('study-topic').props.value).toBe('');
  });

  it('keeps Start off until there is a topic', () => {
    render(<StudyScreen />);
    fireEvent.press(screen.getByTestId('study-start'));
    expect(mockCreateConversation).not.toHaveBeenCalled();
  });

  it('says the recent sessions could not be loaded, then shows them after a retry', async () => {
    (api.get as jest.Mock)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ sessions: [session()] });
    render(<StudyScreen />);

    expect(await screen.findByText('Your recent study sessions could not be loaded.')).toBeTruthy();
    expect(screen.queryByText('RECENT')).toBeNull();

    fireEvent.press(screen.getByTestId('study-history-retry'));

    expect(await screen.findByText('Spanish past tense')).toBeTruthy();
    expect(screen.queryByTestId('study-history-error')).toBeNull();
  });

  it('asks a Local Mode user to switch to Cloud instead of starting', () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    render(<StudyScreen />);
    expect(screen.queryByTestId('study-start')).toBeNull();
    fireEvent.press(screen.getByLabelText('Switch to Cloud mode'));
    expect(useChatAppModeStore.getState().appMode).toBe('cloud');
  });

  it('sends a signed-out Local Mode user to sign in instead of switching', () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    useWaitlistStore.setState({ cloudUnlocked: false });
    render(<StudyScreen />);
    fireEvent.press(screen.getByLabelText('Switch to Cloud mode'));
    expect(useChatAppModeStore.getState().appMode).toBe('local');
    expect(useRouter().push).toHaveBeenCalled();
  });
});

describe('StudyModeBanner', () => {
  it('shows the topic and turns study mode off and back on', async () => {
    (api.get as jest.Mock).mockResolvedValue({ sessions: [session()] });
    (apiFetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ session: session({ endedAt: '2026-10-19T09:00:00.000Z' }) }), {
        status: 200,
      }),
    );
    (api.post as jest.Mock).mockResolvedValue({ session: session() });
    render(<StudyModeBanner conversationId={CONVERSATION_ID} />);

    expect(await screen.findByText('Studying: Spanish past tense · Practise it')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Leave study mode'));
    expect(await screen.findByText(STUDY_MODE_OFF_NOTE)).toBeTruthy();
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/study/sessions',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ conversationId: CONVERSATION_ID }),
      }),
    );

    fireEvent.press(screen.getByLabelText('Turn study mode back on'));
    expect(await screen.findByText('Studying: Spanish past tense · Practise it')).toBeTruthy();
  });

  it('shows study mode as off when leaving was saved but its reply was lost', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({ sessions: [session()] }).mockResolvedValueOnce({
      sessions: [session({ endedAt: '2026-10-19T09:00:00.000Z' })],
    });
    (apiFetch as jest.Mock).mockRejectedValue(new Error('network lost'));
    render(<StudyModeBanner conversationId={CONVERSATION_ID} />);

    expect(await screen.findByText('Studying: Spanish past tense · Practise it')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Leave study mode'));

    expect(await screen.findByText(STUDY_MODE_OFF_NOTE)).toBeTruthy();
    expect(screen.getByLabelText('Turn study mode back on')).toBeTruthy();
  });

  it('stays hidden in a chat that is not a study session', async () => {
    render(<StudyModeBanner conversationId={CONVERSATION_ID} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByTestId('study-mode-banner')).toBeNull();
  });
});
