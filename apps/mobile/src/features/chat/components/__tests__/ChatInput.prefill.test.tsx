/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { render, act } from '@testing-library/react-native';

const mockAppMode: 'local' | 'cloud' = 'cloud';
const mockFetchManagedSkills = jest.fn().mockResolvedValue([]);

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
  getDraftAttachments: jest.fn(() => []),
  setDraft: jest.fn(),
  clearDraft: jest.fn(),
}));

jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => selector({ appMode: mockAppMode }),
    {
      getState: () => ({ appMode: mockAppMode }),
      subscribe: jest.fn(() => jest.fn()),
    },
  ),
}));

let capturedAttachments: Array<{ fileName: string }> = [];
jest.mock('@/src/features/chat/components/AttachmentPreview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    AttachmentPreview: (props: { attachments: Array<{ fileName: string }> }) => {
      capturedAttachments = props.attachments;
      return <View testID="attachment-preview" />;
    },
  };
});

jest.mock('@/src/features/model-picker/store', () => ({
  useModelStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ selectedModel: 'fixture-cloud-model', thinkingEnabledPerModel: {} }),
}));

jest.mock('@/src/features/model-picker/service', () => ({
  getShortDisplayName: (id: string) => id,
  isFreeQuotaTurnModelId: () => false,
}));

jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ isClerkSignedIn: true, clerkUserId: 'user-1' }),
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

const mockTierState = {
  tier: 'free',
  grantedCapabilities: [] as string[],
  codeExecutionAvailable: false,
  genericWebSearchAvailable: false,
};
jest.mock('@/src/features/billing/store', () => ({
  useTierStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => selector(mockTierState),
    { getState: () => mockTierState },
  ),
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

jest.mock('@/src/features/skills/service', () => ({
  fetchManagedSkills: (...args: unknown[]) => mockFetchManagedSkills(...args),
}));

jest.mock('@/src/features/chat/components/FileMentionPalette', () => ({
  FileMentionPalette: () => null,
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: 'user-1', epoch: 1 }),
  isCloudAccountEpochCurrent: () => true,
}));

import { TextInput } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { ChatInput } from '@/src/features/chat/components/ChatInput';
import {
  prefillComposer,
  useComposerPrefillStore,
} from '@/src/features/chat/store/composerPrefillStore';

beforeEach(() => {
  useComposerPrefillStore.setState({ pending: {} });
});

describe('prefilling the composer for a conversation', () => {
  it('puts the text in an empty composer, focuses it and consumes the request', () => {
    const view = render(<ChatInput onSend={jest.fn()} draftKey="chat-1" conversationId="chat-1" />);
    const focus = jest.spyOn(view.UNSAFE_getByType(TextInput).instance, 'focus');

    act(() => prefillComposer('chat-1', 'Change this in Q3 plan: '));

    expect(view.getByTestId('chat.composer.input').props.value).toBe('Change this in Q3 plan: ');
    expect(useComposerPrefillStore.getState().pending).toEqual({});
    expect(focus).toHaveBeenCalled();
  });

  it('keeps what the person already typed and adds the prefill after a blank line', () => {
    const view = render(<ChatInput onSend={jest.fn()} draftKey="chat-1" conversationId="chat-1" />);
    fireEvent.changeText(view.getByTestId('chat.composer.input'), 'Also shorten it  ');

    act(() => prefillComposer('chat-1', 'Change this in Q3 plan: '));

    expect(view.getByTestId('chat.composer.input').props.value).toBe(
      'Also shorten it\n\nChange this in Q3 plan: ',
    );
  });

  it('ignores a prefill for another conversation and applies one that waited for the composer', () => {
    prefillComposer('chat-2', 'Elsewhere');
    prefillComposer('chat-1', 'Waiting text');
    const view = render(<ChatInput onSend={jest.fn()} draftKey="chat-1" conversationId="chat-1" />);

    expect(view.getByTestId('chat.composer.input').props.value).toBe('Waiting text');
    expect(useComposerPrefillStore.getState().pending).toEqual({ 'chat-2': 'Elsewhere' });
  });

  it('refuses an empty conversation id or empty text', () => {
    prefillComposer('', 'text');
    prefillComposer('chat-1', '');
    expect(useComposerPrefillStore.getState().pending).toEqual({});
  });
});
