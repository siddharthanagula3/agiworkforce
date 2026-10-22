/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
let mockTier = 'pro';
let mockFailureCode: string | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

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
      failureCode: mockFailureCode ? { message: 'refused', code: mockFailureCode } : null,
    }),
}));

jest.mock('@/src/features/billing/store', () => ({
  useTierStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      tier: mockTier,
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
import { WORK_USAGE_COPY } from '@agiworkforce/types';
import { WorkUsageCard } from '@/src/features/chat/components/WorkUsageCard';
import { useChatViewStore } from '@/stores/chat/chatViewStore';

beforeEach(() => {
  mockPush.mockReset();
  mockTier = 'pro';
  mockFailureCode = null;
  useChatViewStore.setState({ workMode: 'chat' });
});

describe('DEF-2332 work usage card', () => {
  it('shows the card with Add credits in AGI Work mode and opens billing', () => {
    mockFailureCode = 'insufficient_credits';
    useChatViewStore.setState({ workMode: 'agiwork' });

    render(<ChatInput onSend={jest.fn()} />);

    expect(screen.getByTestId('chat.composer.work-usage')).toBeTruthy();
    expect(screen.getByText(WORK_USAGE_COPY.title)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: WORK_USAGE_COPY.addCredits }));
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/cloud-billing');
  });

  it('stays out of Chat mode', () => {
    mockFailureCode = 'insufficient_credits';

    render(<ChatInput onSend={jest.fn()} />);

    expect(screen.queryByTestId('chat.composer.work-usage')).toBeNull();
  });

  it('shows Free an Upgrade action and no usage figures', () => {
    render(<WorkUsageCard recovery="upgrade" />);

    expect(screen.getByRole('button', { name: WORK_USAGE_COPY.upgrade })).toBeTruthy();
    expect(screen.queryByRole('button', { name: WORK_USAGE_COPY.addCredits })).toBeNull();
    expect(screen.queryByText(/\d+%|\$|credit/i)).toBeNull();
  });
});
