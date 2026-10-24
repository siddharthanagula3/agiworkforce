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

const mockCreateConversation = jest.fn();
jest.mock('@/stores/chatStore', () => ({
  useChatStore: (
    selector: (state: { createConversation: typeof mockCreateConversation }) => unknown,
  ) => selector({ createConversation: mockCreateConversation }),
}));

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { api, apiFetch } from '@/services/api';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { StudyScreen } from '@/src/features/study/StudyScreen';
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

  it('keeps Start off until there is a topic', () => {
    render(<StudyScreen />);
    fireEvent.press(screen.getByTestId('study-start'));
    expect(mockCreateConversation).not.toHaveBeenCalled();
  });

  it('asks a Local Mode user to switch to Cloud instead of starting', () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    render(<StudyScreen />);
    expect(screen.queryByTestId('study-start')).toBeNull();
    fireEvent.press(screen.getByLabelText('Switch to Cloud mode'));
    expect(useChatAppModeStore.getState().appMode).toBe('cloud');
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

  it('stays hidden in a chat that is not a study session', async () => {
    render(<StudyModeBanner conversationId={CONVERSATION_ID} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByTestId('study-mode-banner')).toBeNull();
  });
});
