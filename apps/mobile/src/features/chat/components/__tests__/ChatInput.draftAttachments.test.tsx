/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert } from 'react-native';
import { render, act, fireEvent, waitFor } from '@testing-library/react-native';

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

const mockGetDraftAttachments = jest.fn((): unknown[] => []);
const mockSetDraft = jest.fn();
jest.mock('@/src/features/chat/draftStore', () => ({
  getDraft: jest.fn(() => ''),
  getDraftAttachments: (...args: unknown[]) => mockGetDraftAttachments(...(args as [])),
  setDraft: (...args: unknown[]) => mockSetDraft(...args),
  clearDraft: jest.fn(),
}));

const mockGetInfoAsync = jest.fn(async (_uri: string) => ({ exists: true }));
jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: (uri: string) => mockGetInfoAsync(uri),
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

let capturedAttachments: Array<{ fileName: string; unavailable?: boolean; sendFailed?: boolean }> =
  [];
jest.mock('@/src/features/chat/components/AttachmentPreview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    AttachmentPreview: (props: { attachments: typeof capturedAttachments }) => {
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
import { attachmentLimitsFor } from '@/src/features/chat/utils/attachmentValidation';

const PROVENANCE = { scope: 'local' } as const;

function photo(overrides: Record<string, unknown> = {}) {
  return {
    id: 'photo-1',
    uri: 'file:///cache/ImagePicker/1111.jpg',
    mimeType: 'image/jpeg',
    fileName: 'IMG_0001.jpg',
    fileSize: 2048,
    ...overrides,
  };
}

function photos(count: number) {
  return Array.from({ length: count }, (_, index) =>
    photo({
      id: `photo-${index}`,
      uri: `file:///cache/ImagePicker/${index}.jpg`,
      fileName: `IMG_${index}.jpg`,
    }),
  );
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  capturedAttachments = [];
  mockAppMode = 'cloud';
  mockGetDraftAttachments.mockReset().mockReturnValue([]);
  mockSetDraft.mockReset();
  mockGetInfoAsync.mockReset().mockResolvedValue({ exists: true });
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
});

describe('staging files in the composer', () => {
  it('refuses a second copy of the same photo the picker saved under a new path', () => {
    const ref = React.createRef<ChatInputHandle>();
    render(<ChatInput onSend={jest.fn()} attachRef={ref} />);

    act(() => {
      ref.current!.addAttachments([photo()]);
    });
    act(() => {
      ref.current!.addAttachments([
        photo({ id: 'photo-copy', uri: 'file:///cache/ImagePicker/2222.jpg' }),
      ]);
    });

    expect(capturedAttachments).toHaveLength(1);
    expect((alertSpy.mock.calls[0] as [string])[0]).toBe('Already attached');
  });

  it('stops at the Cloud file count of the plan and says why', () => {
    const limit = attachmentLimitsFor('cloud', 'free').filesPerMessage!;
    const ref = React.createRef<ChatInputHandle>();
    render(<ChatInput onSend={jest.fn()} attachRef={ref} />);

    act(() => {
      ref.current!.addAttachments(photos(limit + 2));
    });

    expect(capturedAttachments).toHaveLength(limit);
    const [title, body] = alertSpy.mock.calls[0] as [string, string];
    expect(title).toBe('Some attachments not added');
    expect(body).toContain(`A message can carry up to ${limit} files.`);
  });
});

describe('files kept with the draft', () => {
  it('saves staged files with the draft of this conversation', () => {
    const ref = React.createRef<ChatInputHandle>();
    render(
      <ChatInput
        onSend={jest.fn()}
        attachRef={ref}
        draftKey="conv-1"
        draftProvenance={PROVENANCE}
      />,
    );

    act(() => {
      ref.current!.addAttachments([photo()]);
    });

    expect(mockSetDraft).toHaveBeenLastCalledWith('conv-1', '', PROVENANCE, [
      expect.objectContaining({ id: 'photo-1' }),
    ]);
  });

  it('brings the files back when the conversation opens again', () => {
    mockGetDraftAttachments.mockReturnValue([photo()]);

    render(<ChatInput onSend={jest.fn()} draftKey="conv-1" draftProvenance={PROVENANCE} />);

    expect(capturedAttachments.map((item) => item.fileName)).toEqual(['IMG_0001.jpg']);
  });

  it('switching conversations shows only the files of the conversation on screen', () => {
    mockGetDraftAttachments.mockImplementation(((key: string) =>
      key === 'conv-1' ? [photo()] : []) as never);
    const view = render(
      <ChatInput onSend={jest.fn()} draftKey="conv-1" draftProvenance={PROVENANCE} />,
    );
    expect(capturedAttachments).toHaveLength(1);

    view.rerender(<ChatInput onSend={jest.fn()} draftKey="conv-2" draftProvenance={PROVENANCE} />);

    expect(capturedAttachments).toHaveLength(0);
  });

  it('marks a restored file the phone no longer has and will not send it', async () => {
    mockGetDraftAttachments.mockReturnValue([photo()]);
    mockGetInfoAsync.mockResolvedValue({ exists: false });
    const onSend = jest.fn();
    const { getByLabelText } = render(
      <ChatInput onSend={onSend} draftKey="conv-1" draftProvenance={PROVENANCE} />,
    );

    await waitFor(() => expect(capturedAttachments[0]?.unavailable).toBe(true));
    fireEvent.press(getByLabelText('Send message'));

    expect(onSend).not.toHaveBeenCalled();
    const [title, body] = alertSpy.mock.calls[0] as [string, string];
    expect(title).toBe('File no longer available');
    expect(body).toContain('IMG_0001.jpg');
  });

  it('a restored file still on the phone stays ready to send', async () => {
    mockGetDraftAttachments.mockReturnValue([photo()]);

    render(<ChatInput onSend={jest.fn()} draftKey="conv-1" draftProvenance={PROVENANCE} />);

    await waitFor(() => expect(mockGetInfoAsync).toHaveBeenCalledWith(photo().uri));
    expect(capturedAttachments[0]?.unavailable).toBeUndefined();
  });
});

describe('a refused send can be sent again from the banner', () => {
  it('reports the refusal and sends the same text and files again', async () => {
    const onSend = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const onRefusedSendChange = jest.fn();
    const ref = React.createRef<ChatInputHandle>();
    const { getByTestId, getByLabelText } = render(
      <ChatInput onSend={onSend} attachRef={ref} onRefusedSendChange={onRefusedSendChange} />,
    );
    act(() => {
      ref.current!.addAttachments([photo()]);
    });
    fireEvent.changeText(getByTestId('chat.composer.input'), 'what is this');

    await act(async () => {
      fireEvent.press(getByLabelText('Send message'));
    });
    expect(onRefusedSendChange).toHaveBeenLastCalledWith(true);
    expect(capturedAttachments[0]?.sendFailed).toBe(true);

    await act(async () => {
      ref.current!.retrySend!();
    });

    expect(onSend).toHaveBeenCalledTimes(2);
    expect(onSend.mock.calls[1]).toEqual([
      'what is this',
      [expect.objectContaining({ id: 'photo-1' })],
    ]);
    expect(onRefusedSendChange).toHaveBeenLastCalledWith(false);
    expect(capturedAttachments).toHaveLength(0);
  });
});
