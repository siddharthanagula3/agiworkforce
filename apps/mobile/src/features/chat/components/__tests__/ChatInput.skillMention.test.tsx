/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { render, act } from '@testing-library/react-native';

let mockAppMode: 'local' | 'cloud' = 'cloud';
const mockFetchManagedSkills = jest.fn();

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

import { fireEvent, waitFor } from '@testing-library/react-native';
import { ChatInput } from '@/src/features/chat/components/ChatInput';
import { useMobileSkillSelectionStore } from '@/src/features/skills/selectionStore';
import { NEW_CHAT_STYLE_KEY, useChatViewStore } from '@/stores/chat/chatViewStore';

const SKILLS = [
  {
    name: 'pdf-forms',
    title: 'PDF forms',
    description: 'Fill forms',
    source: 'bundled',
    lifecycle: 'included',
    downloadable: false,
    requiredTools: ['create_office_file'],
  },
  {
    name: 'code-review',
    description: 'Review code',
    source: 'bundled',
    lifecycle: 'included',
    downloadable: false,
  },
  {
    name: 'data-analysis',
    description: 'Analyse a table',
    source: 'bundled',
    lifecycle: 'included',
    downloadable: false,
    requiredTools: ['execute_code'],
  },
  {
    name: 'later-skill',
    description: 'Not ready',
    source: 'bundled',
    lifecycle: 'draft',
    downloadable: false,
  },
];

beforeEach(() => {
  mockAppMode = 'cloud';
  mockFetchManagedSkills.mockReset();
  mockFetchManagedSkills.mockResolvedValue(SKILLS);
  useMobileSkillSelectionStore.getState().clearSkill();
  mockTierState.grantedCapabilities = ['canUseCloudExecution'];
  mockTierState.codeExecutionAvailable = true;
  useChatViewStore.getState().setRunCode(NEW_CHAT_STYLE_KEY, false);
});

describe('typing @ in the composer offers skills', () => {
  it('lists the skills that match and sets the skill chip when one is chosen', async () => {
    const view = render(<ChatInput onSend={jest.fn()} />);
    const input = view.getByTestId('chat.composer.input');

    fireEvent.changeText(input, 'check this @pdf');

    const row = await view.findByLabelText('Use the PDF forms skill');
    expect(view.queryByLabelText('Use the code-review skill')).toBeNull();
    expect(view.queryByLabelText('Use the later-skill skill')).toBeNull();

    fireEvent.press(row);

    expect(useMobileSkillSelectionStore.getState().selection).toEqual({
      ownerId: 'user-1',
      name: 'pdf-forms',
      requiredTools: ['create_office_file'],
    });
    expect(input.props.value).toBe('check this ');
    await waitFor(() => expect(view.queryByTestId('skill-mention-palette')).toBeNull());
  });

  it('turns Run code on for the turn when the chosen skill needs it, so the server does not refuse', async () => {
    const view = render(<ChatInput onSend={jest.fn()} />);
    fireEvent.changeText(view.getByTestId('chat.composer.input'), '@data');

    fireEvent.press(await view.findByLabelText('Use the data-analysis skill'));

    expect(useChatViewStore.getState().runCodeByConversation[NEW_CHAT_STYLE_KEY]).toBe(true);
  });

  it('leaves Run code off when the skill does not need it or the plan cannot run code', async () => {
    const view = render(<ChatInput onSend={jest.fn()} />);
    fireEvent.changeText(view.getByTestId('chat.composer.input'), '@code');
    fireEvent.press(await view.findByLabelText('Use the code-review skill'));
    expect(useChatViewStore.getState().runCodeByConversation[NEW_CHAT_STYLE_KEY]).toBeUndefined();

    mockTierState.codeExecutionAvailable = false;
    fireEvent.changeText(view.getByTestId('chat.composer.input'), '@data');
    fireEvent.press(await view.findByLabelText('Use the data-analysis skill'));
    expect(useChatViewStore.getState().runCodeByConversation[NEW_CHAT_STYLE_KEY]).toBeUndefined();
  });

  it('lists every included skill for a bare @', async () => {
    const view = render(<ChatInput onSend={jest.fn()} />);

    fireEvent.changeText(view.getByTestId('chat.composer.input'), '@');

    expect(await view.findByLabelText('Use the PDF forms skill')).toBeTruthy();
    expect(view.getByLabelText('Use the code-review skill')).toBeTruthy();
  });

  it('offers nothing in Local mode, where skills are not available', async () => {
    mockAppMode = 'local';
    const view = render(<ChatInput onSend={jest.fn()} />);

    fireEvent.changeText(view.getByTestId('chat.composer.input'), '@pdf');

    expect(view.queryByTestId('skill-mention-palette')).toBeNull();
    expect(mockFetchManagedSkills).not.toHaveBeenCalled();
  });
});
