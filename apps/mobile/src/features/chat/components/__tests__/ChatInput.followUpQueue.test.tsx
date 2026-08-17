/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) => {
        if (name === '__esModule') return true;
        return (props: Record<string, unknown>) => (
          <View testID={`icon-${String(name)}`} {...props} />
        );
      },
    },
  );
});

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@/src/features/chat/draftStore', () => ({
  getDraft: jest.fn(() => ''),
  setDraft: jest.fn(),
  clearDraft: jest.fn(),
}));

jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ appMode: 'cloud' }),
}));

jest.mock('@/src/features/chat/components/AttachmentPreview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { AttachmentPreview: () => <View testID="attachment-preview" /> };
});

jest.mock('@/src/features/model-picker/store', () => ({
  useModelStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ selectedModel: 'fixture-cloud-model', thinkingEnabledPerModel: {} }),
}));

jest.mock('@/src/features/model-picker/service', () => ({
  getShortDisplayName: (id: string) => id,
}));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ isClerkSignedIn: true }),
}));

jest.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      features: {
        webSearch: true,
        imageGen: true,
        health: false,
        codeExecution: false,
        research: false,
      },
    }),
}));

jest.mock('@/src/features/billing/store', () => ({
  useTierStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      tier: 'free',
      grantedCapabilities: [],
      codeExecutionAvailable: false,
      genericWebSearchAvailable: false,
    }),
}));

jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ hapticsEnabled: false, themeMode: 'dark' }),
}));

jest.mock('@/src/features/voice/services/voice', () => ({
  isRecording: jest.fn().mockReturnValue(false),
  cancelRecording: jest.fn().mockResolvedValue(undefined),
  stopRecording: jest.fn().mockResolvedValue('mock-uri'),
  transcribe: jest.fn().mockResolvedValue({ text: '' }),
}));

jest.mock('@/src/features/voice/components/VoiceInputButton', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { VoiceInputButton: () => <View testID="voice-input-button" /> };
});

jest.mock('@/services/docParser', () => ({
  isParseableDocument: () => true,
  PICKABLE_DOCUMENT_MIME_TYPES: [],
}));

import { ChatInput } from '@/src/features/chat/components/ChatInput';

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
});

function mountStreaming(onSend: jest.Mock, onStop: jest.Mock) {
  const view = render(<ChatInput onSend={onSend} onStop={onStop} isStreaming />);
  return view;
}

describe('ChatInput follow-up queue while streaming (UI-52)', () => {
  it('queues a follow-up typed mid-stream instead of aborting the turn, and flushes it when the turn ends', () => {
    const onSend = jest.fn().mockReturnValue(true);
    const onStop = jest.fn();
    const { getByTestId, getByLabelText, getAllByTestId, queryAllByTestId, rerender } =
      mountStreaming(onSend, onStop);

    fireEvent.changeText(getByTestId('chat.composer.input'), 'what about pricing?');

    act(() => {
      fireEvent.press(getByLabelText('Queue message'));
    });

    expect(onSend).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
    expect(getAllByTestId('chat.composer.queued-followup')).toHaveLength(1);

    act(() => {
      rerender(<ChatInput onSend={onSend} onStop={onStop} isStreaming={false} />);
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('what about pricing?', undefined);
    expect(queryAllByTestId('chat.composer.queued-followup')).toHaveLength(0);
  });

  it('drops a cancelled follow-up so it never sends when the turn ends', () => {
    const onSend = jest.fn().mockReturnValue(true);
    const onStop = jest.fn();
    const { getByTestId, getByLabelText, getAllByTestId, queryAllByTestId, rerender } =
      mountStreaming(onSend, onStop);

    fireEvent.changeText(getByTestId('chat.composer.input'), 'never mind');
    act(() => {
      fireEvent.press(getByLabelText('Queue message'));
    });
    expect(getAllByTestId('chat.composer.queued-followup')).toHaveLength(1);

    act(() => {
      fireEvent.press(getByLabelText('Cancel queued message'));
    });
    expect(queryAllByTestId('chat.composer.queued-followup')).toHaveLength(0);

    act(() => {
      rerender(<ChatInput onSend={onSend} onStop={onStop} isStreaming={false} />);
    });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('keeps the stop control reachable while a follow-up is being composed', () => {
    const onSend = jest.fn().mockReturnValue(true);
    const onStop = jest.fn();
    const { getByTestId, getByLabelText } = mountStreaming(onSend, onStop);

    fireEvent.changeText(getByTestId('chat.composer.input'), 'still typing');

    act(() => {
      fireEvent.press(getByLabelText('Stop generating'));
    });

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('releases one queued message per finished turn so two turns never race', () => {
    const onSend = jest.fn().mockReturnValue(true);
    const onStop = jest.fn();
    const { getByTestId, getByLabelText, getAllByTestId, rerender } = mountStreaming(
      onSend,
      onStop,
    );

    for (const draft of ['first follow up', 'second follow up']) {
      fireEvent.changeText(getByTestId('chat.composer.input'), draft);
      act(() => {
        fireEvent.press(getByLabelText('Queue message'));
      });
    }
    expect(getAllByTestId('chat.composer.queued-followup')).toHaveLength(2);

    act(() => {
      rerender(<ChatInput onSend={onSend} onStop={onStop} isStreaming={false} />);
    });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('first follow up', undefined);
    expect(getAllByTestId('chat.composer.queued-followup')).toHaveLength(1);

    act(() => {
      rerender(<ChatInput onSend={onSend} onStop={onStop} isStreaming />);
    });
    act(() => {
      rerender(<ChatInput onSend={onSend} onStop={onStop} isStreaming={false} />);
    });
    expect(onSend).toHaveBeenCalledTimes(2);
    expect(onSend).toHaveBeenLastCalledWith('second follow up', undefined);
  });
});
