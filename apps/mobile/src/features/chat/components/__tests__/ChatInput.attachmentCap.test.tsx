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
import {
  CHAT_ATTACHMENT_LIMITS,
  CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE,
  chatAttachmentLimitsToWire,
} from '@agiworkforce/cloud-contracts';
import {
  applyServerAttachmentLimits,
  clearServerAttachmentLimits,
} from '@/src/features/chat/upload/attachmentLimits';

const MIB = 1024 * 1024;
const imageLimitText = (bytes: number) => `images up to ${Math.round(bytes / MIB)} MB`;
const OVER_CLOUD_IMAGE_LIMIT = CHAT_ATTACHMENT_LIMITS.maxImageBytes + 1;

function bigPhoto(fileSize = OVER_CLOUD_IMAGE_LIMIT) {
  return {
    id: 'photo-1',
    uri: 'file:///tmp/scan.png',
    mimeType: 'image/png',
    fileName: 'scan.png',
    fileSize,
  };
}

function mountAndAttach(file: ReturnType<typeof bigPhoto>) {
  const ref = React.createRef<ChatInputHandle>();
  render(<ChatInput onSend={jest.fn()} attachRef={ref} />);
  act(() => {
    ref.current!.addAttachments([file]);
  });
  return ref;
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  capturedAttachments = [];
  applyServerAttachmentLimits(chatAttachmentLimitsToWire(CHAT_ATTACHMENT_LIMITS));
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  clearServerAttachmentLimits();
  alertSpy.mockRestore();
});

describe('ChatInput attachment cap follows the live boundary', () => {
  it('refuses a photo over the Cloud image limit and blames the cloud limit, not the network', () => {
    mockAppMode = 'cloud';

    mountAndAttach(bigPhoto());

    expect(capturedAttachments).toHaveLength(0);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, body] = alertSpy.mock.calls[0] as [string, string];
    expect(title).toBe('Attachment not added');
    expect(body).toContain('scan.png');
    expect(body).toContain('AGI Cloud');
    expect(body).toContain(imageLimitText(CHAT_ATTACHMENT_LIMITS.maxImageBytes));
    expect(body.toLowerCase()).not.toContain('connection');
  });

  it('holds a Cloud photo to the conservative limit while the server has sent no limits', () => {
    clearServerAttachmentLimits();
    mockAppMode = 'cloud';

    mountAndAttach(bigPhoto(CHAT_ATTACHMENT_LIMITS.maxImageBytes));

    expect(capturedAttachments).toHaveLength(0);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect((alertSpy.mock.calls[0] as [string, string])[1]).toContain(
      imageLimitText(CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE.maxImageBytes),
    );
  });

  it('leaves Local alone while the server has sent no limits', () => {
    clearServerAttachmentLimits();
    mockAppMode = 'local';

    mountAndAttach(bigPhoto(CHAT_ATTACHMENT_LIMITS.maxImageBytes));

    expect(capturedAttachments.map((a) => a.fileName)).toEqual(['scan.png']);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('still stages the same photo in Local, which never uploads', () => {
    mockAppMode = 'local';

    mountAndAttach(bigPhoto());

    expect(capturedAttachments.map((a) => a.fileName)).toEqual(['scan.png']);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('accepts a photo inside the cloud contract in Cloud', () => {
    mockAppMode = 'cloud';

    mountAndAttach(bigPhoto(CHAT_ATTACHMENT_LIMITS.maxImageBytes));

    expect(capturedAttachments.map((a) => a.fileName)).toEqual(['scan.png']);
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
