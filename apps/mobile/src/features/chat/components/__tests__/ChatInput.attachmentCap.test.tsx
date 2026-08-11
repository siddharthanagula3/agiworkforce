/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * The composer must not stage an attachment the send will deterministically
 * refuse, and when it refuses one it must name the real cause.
 *
 * This drives the SAME imperative handle the real pickers use:
 * `app/(app)/(tabs)/chat.tsx:547/563/587/596` and
 * `app/(app)/chat/[id].tsx:745/761/785/794` all call
 * `chatInputAttachRef.current?.addAttachments(...)` with `fileSize` taken
 * straight off the ImagePicker/DocumentPicker asset.
 *
 * Before the fix the cap was a flat 25 MB, so a 20 MB file was accepted here,
 * then `uploadWithRetry` (stores/chat/chatExecutionStore.ts:503) burned three
 * exponential-backoff retries against a 12 MiB presign contract and alerted
 * "Could not upload … please check your connection".
 */
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

// The one piece of real state under test: the live Local/Cloud boundary.
jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ appMode: mockAppMode }),
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

/** Between the 12 MiB cloud contract and the 25 MB device ceiling. */
const TWENTY_MB = 20 * 1024 * 1024;

function twentyMbPdf() {
  return {
    id: 'doc-1',
    uri: 'file:///tmp/report.pdf',
    mimeType: 'application/pdf',
    fileName: 'report.pdf',
    fileSize: TWENTY_MB,
  };
}

function mountAndAttach(file: ReturnType<typeof twentyMbPdf>) {
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
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
});

describe('ChatInput attachment cap follows the live boundary', () => {
  it('refuses a 20 MB file in Cloud and blames the cloud limit, not the network', () => {
    mockAppMode = 'cloud';

    mountAndAttach(twentyMbPdf());

    expect(capturedAttachments).toHaveLength(0);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, body] = alertSpy.mock.calls[0] as [string, string];
    expect(title).toBe('Attachment not added');
    expect(body).toContain('report.pdf');
    expect(body).toContain('AGI Cloud');
    expect(body).toContain('12 MB');
    expect(body.toLowerCase()).not.toContain('connection');
  });

  it('still stages the same 20 MB file in Local, which never uploads', () => {
    mockAppMode = 'local';

    mountAndAttach(twentyMbPdf());

    expect(capturedAttachments.map((a) => a.fileName)).toEqual(['report.pdf']);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('accepts a file inside the cloud contract in Cloud', () => {
    mockAppMode = 'cloud';

    mountAndAttach({ ...twentyMbPdf(), fileSize: 4 * 1024 * 1024 });

    expect(capturedAttachments.map((a) => a.fileName)).toEqual(['report.pdf']);
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
