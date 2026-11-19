/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { render, act } from '@testing-library/react-native';

let mockAppMode: 'local' | 'cloud' = 'cloud';

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

import { ChatInput, type ChatInputHandle } from '@/src/features/chat/components/ChatInput';

function textDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    uri: 'file:///cache/a/report.txt',
    mimeType: 'text/plain',
    fileName: 'report.txt',
    fileSize: 4,
    ...overrides,
  };
}

function mount() {
  mockAppMode = 'cloud';
  const ref = React.createRef<ChatInputHandle>();
  render(<ChatInput onSend={jest.fn()} attachRef={ref} />);
  return ref;
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  capturedAttachments = [];
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
});

describe('ChatInput attachment identity follows the resource, not its metadata', () => {
  it('keeps two distinct files that share a name, type and size', () => {
    const ref = mount();

    act(() => {
      ref.current!.addAttachments([
        textDocument(),
        textDocument({ id: 'doc-2', uri: 'file:///cache/b/report.txt' }),
      ]);
    });

    expect(capturedAttachments).toHaveLength(2);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('keeps a second same-metadata file selected after the first', () => {
    const ref = mount();

    act(() => {
      ref.current!.addAttachments([textDocument()]);
    });
    act(() => {
      ref.current!.addAttachments([
        textDocument({ id: 'doc-2', uri: 'file:///cache/b/report.txt' }),
      ]);
    });

    expect(capturedAttachments).toHaveLength(2);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('still refuses the same file location selected twice', () => {
    const ref = mount();

    act(() => {
      ref.current!.addAttachments([textDocument()]);
    });
    act(() => {
      ref.current!.addAttachments([textDocument({ id: 'doc-2' })]);
    });

    expect(capturedAttachments).toHaveLength(1);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect((alertSpy.mock.calls[0] as [string])[0]).toBe('Already attached');
  });

  it('refuses the same Library asset by its asset id and keeps different assets', () => {
    const ref = mount();

    act(() => {
      ref.current!.addAttachments([
        textDocument({ assetId: 'asset-1', uri: 'https://files.example/one' }),
        textDocument({ id: 'doc-2', assetId: 'asset-2', uri: 'https://files.example/two' }),
        textDocument({ id: 'doc-3', assetId: 'asset-1', uri: 'https://files.example/three' }),
      ]);
    });

    expect(capturedAttachments).toHaveLength(2);
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });
});
