/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock('@/src/features/billing/nativePurchaseAvailability', () => ({
  NATIVE_PURCHASES_AVAILABLE: true,
}));

import React from 'react';
import { Alert, Dimensions, Keyboard, StyleSheet, TextInput } from 'react-native';
import {
  render,
  fireEvent,
  waitFor,
  act,
  within,
  screen as renderedScreen,
} from '@testing-library/react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { getModelMetadataById, getModelReasoning } from '@agiworkforce/types';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';
import { LARGEST_IOS_TEXT_SCALE, setTextScale } from '../test-utils/textScale';
import { MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH } from '@agiworkforce/cloud-contracts';
import { LARGE_PASTE_THRESHOLD, pastedTextFileName } from '@agiworkforce/utils/composer-paste';
import { READING_COLUMN_MAX_WIDTH } from '../src/shared/layout/contentColumn';
import { NEW_CHAT_STYLE_KEY, useChatViewStore } from '../stores/chat/chatViewStore';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';

const mockCapabilityModelId = requireMobileCloudModel((model) => {
  const metadata = getModelMetadataById(model.id);
  return (
    metadata?.capabilities.research === true &&
    metadata.capabilities.search === true &&
    metadata.capabilities.codeExecution === true
  );
}, 'Mobile Cloud model with research, search, and code execution').id;
let mockSelectedModel = mockCapabilityModelId;
const effortModelId = requireMobileCloudModel((model) => {
  const reasoning = getModelReasoning(model.id);
  return reasoning.control === 'effort_levels' && (reasoning.supportedEfforts ?? []).length > 1;
}, 'Cloud model with more than one effort level').id;
let mockAppMode: 'local' | 'cloud' = 'local';
let mockIsClerkSignedIn = false;
let mockChatFeatures = {
  webSearch: true,
  imageGen: true,
  health: false,
  codeExecution: false,
  research: false,
};
let mockTierState = {
  tier: 'free',
  grantedCapabilities: [] as string[],
  codeExecutionAvailable: false,
  genericWebSearchAvailable: false,
};

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

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store && store.persist && typeof store.persist.rehydrate === 'function')
      store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../src/features/chat/draftStore', () => ({
  getDraft: jest.fn(() => ''),
  getDraftAttachments: jest.fn(() => []),
  setDraft: jest.fn(),
  clearDraft: jest.fn(),
}));
const mockDraftStore = require('../src/features/chat/draftStore') as {
  getDraft: jest.Mock;
  setDraft: jest.Mock;
  clearDraft: jest.Mock;
};
const mockGetDraft = mockDraftStore.getDraft;
const mockSetDraft = mockDraftStore.setDraft;

let capturedAttachmentPreviewProps:
  | {
      attachments: Array<{
        id: string;
        fileName: string;
        pastedText?: string;
        sendFailed?: boolean;
      }>;
      onExpandPastedText?: (id: string) => void;
      onRemove?: (id: string) => void;
      onRetryUpload?: (id: string) => void;
      preparing?: Array<{ id: string; failed: boolean }>;
      onDismissPreparing?: (id: string) => void;
    }
  | undefined;

jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  ...jest.requireActual('../src/features/auth/services/cloudAccountSession'),
  captureCloudAccountEpoch: () => ({ ownerId: 'account-a', epoch: 1 }),
  isCloudAccountEpochCurrent: () => true,
}));

const mockUploadWithRetry = jest.fn();
jest.mock('../src/features/chat/upload/uploadAttachment', () => ({
  uploadWithRetry: (...args: unknown[]) => mockUploadWithRetry(...args),
}));

const mockWriteAsStringAsync = jest.fn(async (..._args: unknown[]) => undefined);
const mockDeleteAsync = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('expo-file-system/legacy', () => ({
  ...jest.requireActual('expo-file-system/legacy'),
  cacheDirectory: 'file:///cache/',
  writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

const mockResolveUploadContext = jest.fn();
jest.mock('../src/features/chat/upload/uploadContext', () => ({
  resolveUploadContext: (...args: unknown[]) => mockResolveUploadContext(...args),
}));

jest.mock('../src/features/chat/components/AttachmentPreview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    AttachmentPreview: (props: {
      attachments: Array<{
        id: string;
        fileName: string;
        pastedText?: string;
        sendFailed?: boolean;
      }>;
      onExpandPastedText?: (id: string) => void;
      onRemove?: (id: string) => void;
      onRetryUpload?: (id: string) => void;
      preparing?: Array<{ id: string; failed: boolean }>;
      onDismissPreparing?: (id: string) => void;
    }) => {
      capturedAttachmentPreviewProps = props;
      return <View testID="attachment-preview" />;
    },
  };
});

jest.mock('../src/features/chat/components/SendButton', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    SendButton: ({
      state,
      onPress,
      disabled,
      accessibilityLabel,
    }: {
      state: string;
      onPress: () => void;
      disabled?: boolean;
      accessibilityLabel?: string;
    }) => (
      <Pressable
        onPress={onPress}
        disabled={disabled && state === 'idle'}
        testID="send-button"
        accessibilityLabel={
          accessibilityLabel ??
          (state === 'streaming'
            ? 'Stop generating'
            : state === 'queued'
              ? 'Queued'
              : 'Send message')
        }
        accessibilityRole="button"
      >
        <Text>{state === 'streaming' ? 'Stop' : 'Send'}</Text>
      </Pressable>
    ),
  };
});

jest.mock('../src/features/chat/components/CommandPalette', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CommandPalette: () => <View testID="command-palette" />,
  };
});

const mockVoiceStop = jest.fn();
const mockVoiceCancel = jest.fn();

jest.mock('../src/features/voice/components/VoiceInputButton', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    VoiceInputButton: (props: {
      controlRef?: React.Ref<unknown>;
      onRecordingStart?: () => void;
    }) => {
      React.useImperativeHandle(props.controlRef, () => ({
        stop: mockVoiceStop,
        cancel: mockVoiceCancel,
      }));
      capturedRecordingStart = props.onRecordingStart;
      return (
        <Pressable testID="voice-input-button" accessibilityLabel="Voice input">
          <Text>Mic</Text>
        </Pressable>
      );
    },
  };
});

let capturedRecordingStart: (() => void) | undefined;

jest.mock('../src/features/model-picker/store', () => ({
  useModelStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      selectedModel: mockSelectedModel,
      thinkingEnabledPerModel: {},
    }),
}));

jest.mock('../src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => selector({ appMode: mockAppMode }),
    {
      getState: () => ({ appMode: mockAppMode }),
      subscribe: jest.fn(() => jest.fn()),
    },
  ),
}));

jest.mock('../src/features/auth/store', () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ isClerkSignedIn: mockIsClerkSignedIn }),
}));

jest.mock('../stores/chatStore', () => ({
  useChatStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ features: mockChatFeatures }),
}));

jest.mock('../src/features/billing/store', () => ({
  useTierStore: (selector: (s: Record<string, unknown>) => unknown) => selector(mockTierState),
}));

let mockFreeQuotaModelIds = new Set<string>();
jest.mock('../src/features/model-picker/service', () => ({
  getShortDisplayName: (id: string) => (id === mockSelectedModel ? 'Fixture Model' : id),
  isFreeQuotaTurnModelId: (id: string) => mockFreeQuotaModelIds.has(id),
}));

jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ hapticsEnabled: false, themeMode: 'dark' }),
}));

jest.mock('../src/ui/theme', () => {
  const themeColors = {
    background: '#000000',
    surfaceBase: '#171717',
    teal: '#14b8a6',
    terraCotta: '#e07a5f',
    textMuted: '#888',
    textSecondary: '#bbb',
    textPrimary: '#fff',
    surfaceElevated: '#1a1a1a',
    surfaceHover: '#303030',
    inputSurface: '#242424',
    accentSurface: '#292929',
    accentBorder: '#555',
    border: '#444',
    composerBorder: '#333',
    transparent: 'transparent',
  };
  return {
    useTheme: () => ({ colors: themeColors, isDark: true }),
    useThemeColors: () => themeColors,
    colors: themeColors,
    radii: {
      sm: 6,
      md: 8,
      lg: 12,
      xl: 16,
      '2xl': 24,
      '3xl': 32,
      full: 9999,
    },
  };
});

jest.mock('../lib/constants', () => ({
  MAX_INPUT_LINES: 6,
}));

import { ChatInput, type ChatInputHandle } from '../src/features/chat/components/ChatInput';
import { HEADER_TEXT_SCALE_LIMIT } from '../src/features/chat/components/WorkModeSwitch';
import { chatTypography } from '../src/ui/theme/tokens';
import { useUploadLifecycleStore } from '../src/features/chat/upload/uploadLifecycle';
import { runComposerAttachmentPick } from '../src/features/chat/utils/runComposerAttachmentPick';
import { confirmCloudUpload } from '../src/features/chat/utils/cloudUploadConsent';
import type { Attachment } from '../src/features/chat/components/AttachmentPreview';
import { useComposerPrefillStore } from '../src/features/chat/store/composerPrefillStore';
import {
  applyServerMessageLimits,
  clearServerMessageLimits,
} from '../src/features/chat/upload/messageLimits';
import {
  adoptComposerHandoff,
  stageComposerText,
  takeComposerText,
} from '../src/features/chat/composerHandoff';

const defaultProps = {
  onSend: jest.fn(),
  isStreaming: false,
  onStop: jest.fn(),
  onOpenModelPicker: jest.fn(),
  onOpenVoiceMode: jest.fn(),
  onOpenAddToChat: jest.fn(),
  onOpenConnectors: jest.fn(),
  isOnline: true,
};

function renderInput(overrides: Partial<React.ComponentProps<typeof ChatInput>> = {}) {
  return render(<ChatInput {...defaultProps} {...overrides} />);
}

function measureOneLine(height: number = chatTypography.body.lineHeight) {
  fireEvent(
    renderedScreen.getByTestId('chat.composer.line-probe', { includeHiddenElements: true }),
    'layout',
    {
      nativeEvent: { layout: { x: 0, y: 0, width: 4, height } },
    },
  );
}

function stackComposer(input: ReturnType<typeof renderInput>['getByLabelText']) {
  measureOneLine();
  fireEvent(input('Message input'), 'contentSizeChange', {
    nativeEvent: { contentSize: { width: 280, height: 96 } },
  });
}

describe('ChatInput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedRecordingStart = undefined;
    capturedAttachmentPreviewProps = undefined;
    mockSelectedModel = mockCapabilityModelId;
    mockFreeQuotaModelIds = new Set();
    clearServerMessageLimits();
    mockAppMode = 'local';
    mockIsClerkSignedIn = false;
    mockChatFeatures = {
      webSearch: true,
      imageGen: true,
      health: false,
      codeExecution: false,
      research: false,
    };
    mockTierState = {
      tier: 'free',
      grantedCapabilities: [],
      codeExecutionAvailable: false,
      genericWebSearchAvailable: false,
    };
    useChatViewStore.setState({
      workMode: 'chat',
      styleConversationId: null,
      runCodeByConversation: {},
    });
    useLocalSettingsStore.setState({ autoCorrectEnabled: true });
    mockGetDraft.mockReturnValue('');
  });

  it('gives the composer controls separate physical touch targets', () => {
    const { getByRole, getByLabelText } = renderInput();

    expect(getByRole('button', { name: 'Add to chat' })).toHaveStyle({ width: 44, height: 44 });
    expect(getByRole('button', { name: 'Start voice mode' })).toHaveStyle({
      width: 44,
      height: 44,
    });
    expect(getByLabelText('Message input')).toHaveStyle({ fontSize: 16, alignSelf: 'stretch' });
  });

  it('reserves input space for the expanded-editor target above the control row', () => {
    const { getByLabelText, getByRole } = renderInput();
    fireEvent.changeText(getByLabelText('Message input'), 'Create a video of an stylist anime');
    stackComposer(getByLabelText);

    expect(getByRole('button', { name: 'Expand message' })).toHaveStyle({
      width: 44,
      height: 44,
    });
    expect(getByRole('button', { name: 'Add to chat' })).toHaveStyle({ width: 44, height: 44 });
    expect(getByLabelText('Message input')).toHaveStyle({ minHeight: 44, paddingRight: 44 });
  });

  describe('an attachment that is still being prepared', () => {
    const picked = {
      id: 'photo-1',
      uri: 'file:///photo-1.jpg',
      mimeType: 'image/jpeg',
      fileName: 'photo-1.jpg',
    };

    function startPick(attachRef: React.RefObject<ChatInputHandle | null>) {
      let finish!: (items: (typeof picked)[]) => void;
      let failPick!: (error: Error) => void;
      const onError = jest.fn();
      const done = runComposerAttachmentPick(
        attachRef.current!.captureAttachmentOperation('local'),
        () =>
          new Promise((resolve, reject) => {
            finish = resolve;
            failPick = reject;
          }),
        onError,
      );
      return {
        done,
        onError,
        finish: (items: (typeof picked)[]) => finish(items),
        fail: (error: Error) => failPick(error),
      };
    }

    it('holds a placeholder in the composer until the picked photo is ready', async () => {
      const attachRef = React.createRef<ChatInputHandle>();
      renderInput({ attachRef, draftKey: 'conversation-1', draftProvenance: { scope: 'local' } });

      const pick = startPick(attachRef);
      await act(async () => undefined);

      expect(capturedAttachmentPreviewProps?.preparing).toEqual([
        expect.objectContaining({ failed: false }),
      ]);

      await act(async () => {
        pick.finish([picked]);
        await pick.done;
      });

      expect(capturedAttachmentPreviewProps?.preparing ?? []).toEqual([]);
      expect(capturedAttachmentPreviewProps?.attachments.map((item) => item.id)).toEqual([
        'photo-1',
      ]);
    });

    it('shows one placeholder per chosen photo from the moment the picker closes', async () => {
      const attachRef = React.createRef<ChatInputHandle>();
      renderInput({ attachRef, draftKey: 'conversation-1', draftProvenance: { scope: 'local' } });
      let closePicker!: () => void;
      let finish!: (items: (typeof picked)[]) => void;
      const pickerClosed = new Promise<void>((resolve) => {
        closePicker = resolve;
      });
      const onError = jest.fn();
      const done = runComposerAttachmentPick(
        attachRef.current!.captureAttachmentOperation('local'),
        async (_scope, onPicked) => {
          await pickerClosed;
          onPicked(3);
          return new Promise((resolve) => {
            finish = resolve;
          });
        },
        onError,
      );

      await act(async () => {
        closePicker();
      });

      expect(capturedAttachmentPreviewProps?.preparing).toHaveLength(3);
      expect(capturedAttachmentPreviewProps?.preparing).toEqual(
        Array.from({ length: 3 }, () => expect.objectContaining({ failed: false })),
      );

      const photos = [1, 2, 3].map((n) => ({
        ...picked,
        id: `photo-${n}`,
        uri: `file:///photo-${n}.jpg`,
      }));
      await act(async () => {
        finish(photos);
        await done;
      });

      expect(onError).not.toHaveBeenCalled();
      expect(capturedAttachmentPreviewProps?.preparing ?? []).toEqual([]);
      expect(capturedAttachmentPreviewProps?.attachments.map((item) => item.id)).toEqual([
        'photo-1',
        'photo-2',
        'photo-3',
      ]);
    });

    it('leaves a single error behind when several chosen photos cannot be prepared', async () => {
      const attachRef = React.createRef<ChatInputHandle>();
      renderInput({ attachRef, draftKey: 'conversation-1', draftProvenance: { scope: 'local' } });
      const onError = jest.fn();

      await act(async () => {
        await runComposerAttachmentPick(
          attachRef.current!.captureAttachmentOperation('local'),
          async (_scope, onPicked) => {
            onPicked(2);
            throw new Error('metadata');
          },
          onError,
        );
      });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(capturedAttachmentPreviewProps?.preparing).toEqual([
        expect.objectContaining({ failed: true }),
      ]);
    });

    it('turns the placeholder into an error the person can dismiss when preparing fails', async () => {
      const attachRef = React.createRef<ChatInputHandle>();
      renderInput({ attachRef, draftKey: 'conversation-1', draftProvenance: { scope: 'local' } });

      const pick = startPick(attachRef);
      await act(async () => {
        pick.fail(new Error('metadata'));
        await pick.done;
      });

      expect(pick.onError).toHaveBeenCalled();
      const [failed] = capturedAttachmentPreviewProps?.preparing ?? [];
      expect(failed).toEqual(expect.objectContaining({ failed: true }));

      act(() => capturedAttachmentPreviewProps?.onDismissPreparing?.(failed!.id));

      expect(capturedAttachmentPreviewProps?.preparing ?? []).toEqual([]);
    });

    it('drops the placeholder without a trace when the picker is cancelled', async () => {
      const attachRef = React.createRef<ChatInputHandle>();
      renderInput({ attachRef, draftKey: 'conversation-1', draftProvenance: { scope: 'local' } });

      const pick = startPick(attachRef);
      await act(async () => {
        pick.finish([]);
        await pick.done;
      });

      expect(capturedAttachmentPreviewProps?.preparing ?? []).toEqual([]);
      expect(capturedAttachmentPreviewProps?.attachments ?? []).toEqual([]);
    });
  });

  describe('a message queued while an answer is being written', () => {
    afterEach(() => {
      mockSetDraft.mockReset();
      mockDraftStore.clearDraft.mockReset();
      mockGetDraft.mockReset();
    });

    function backDraftsWithMemory() {
      const stored = new Map<string, string>();
      const slot = (key: string, provenance?: { scope: string; ownerId?: string }) =>
        `${provenance?.scope}:${provenance?.ownerId ?? ''}:${key}`;
      mockSetDraft.mockImplementation(
        (key: string, value: string, provenance?: { scope: string; ownerId?: string }) => {
          if (value.trim()) stored.set(slot(key, provenance), value);
          else stored.delete(slot(key, provenance));
        },
      );
      mockGetDraft.mockImplementation(
        (key: string, provenance?: { scope: string; ownerId?: string }) =>
          stored.get(slot(key, provenance)) ?? '',
      );
      mockDraftStore.clearDraft.mockImplementation(
        (key: string, provenance?: { scope: string; ownerId?: string }) => {
          stored.delete(slot(key, provenance));
        },
      );
      return { stored, slot };
    }

    it('is kept with the draft and comes back unsent when the composer opens again', async () => {
      const { stored, slot } = backDraftsWithMemory();
      const onSend = jest.fn();
      const local = { scope: 'local' as const };
      const first = renderInput({
        onSend,
        isStreaming: true,
        draftKey: 'conversation-1',
        draftProvenance: local,
      });

      fireEvent.changeText(first.getByLabelText('Message input'), 'Also check the dates');
      fireEvent.press(first.getByLabelText('Queue message'));

      expect(first.getByTestId('chat.composer.queued-followup')).toBeTruthy();
      expect(first.getByLabelText('Message input').props.value).toBe('');
      expect(stored.get(slot('conversation-1', local))).toBe('Also check the dates');
      first.unmount();

      const reopened = renderInput({
        onSend,
        isStreaming: false,
        draftKey: 'conversation-1',
        draftProvenance: local,
      });
      await act(async () => undefined);

      expect(reopened.getByDisplayValue('Also check the dates')).toBeTruthy();
      expect(onSend).not.toHaveBeenCalled();
    });

    it('stays inside the Local or Cloud draft it was written in', () => {
      const { stored, slot } = backDraftsWithMemory();
      const cloud = { scope: 'cloud' as const, ownerId: 'account-a' };
      const view = renderInput({
        isStreaming: true,
        draftKey: 'conversation-1',
        draftProvenance: cloud,
      });

      fireEvent.changeText(view.getByLabelText('Message input'), 'Cloud follow-up');
      fireEvent.press(view.getByLabelText('Queue message'));

      expect(stored.get(slot('conversation-1', cloud))).toBe('Cloud follow-up');
      expect(stored.get(slot('conversation-1', { scope: 'local' }))).toBeUndefined();
    });

    it('leaves the stored draft once the queued message has gone out', async () => {
      const { stored, slot } = backDraftsWithMemory();
      const local = { scope: 'local' as const };
      const onSend = jest.fn(async () => true);
      const view = renderInput({
        onSend,
        isStreaming: true,
        draftKey: 'conversation-1',
        draftProvenance: local,
      });
      fireEvent.changeText(view.getByLabelText('Message input'), 'Send me next');
      fireEvent.press(view.getByLabelText('Queue message'));

      await act(async () => {
        view.rerender(
          <ChatInput
            {...defaultProps}
            onSend={onSend}
            isStreaming={false}
            draftKey="conversation-1"
            draftProvenance={local}
          />,
        );
      });

      expect(onSend).toHaveBeenCalledWith('Send me next', undefined);
      expect(stored.get(slot('conversation-1', local))).toBeUndefined();
    });
  });

  describe('account-scoped drafts', () => {
    it('reloads text and writes with explicit provenance when the Cloud owner changes', async () => {
      mockGetDraft.mockImplementation(() => 'Account A draft');
      const { getByLabelText, getByDisplayValue, rerender } = renderInput({
        draftKey: 'conversation-1',
        draftProvenance: { scope: 'cloud', ownerId: 'account-a' },
      });
      expect(getByDisplayValue('Account A draft')).toBeTruthy();

      fireEvent.changeText(getByLabelText('Message input'), 'Account A edited secret');
      expect(mockSetDraft).toHaveBeenLastCalledWith('conversation-1', 'Account A edited secret', {
        scope: 'cloud',
        ownerId: 'account-a',
      });

      mockGetDraft.mockImplementation(() => 'Account B draft');
      await act(async () => {
        rerender(
          <ChatInput
            {...defaultProps}
            draftKey="conversation-1"
            draftProvenance={{ scope: 'cloud', ownerId: 'account-b' }}
          />,
        );
      });

      expect(getByDisplayValue('Account B draft')).toBeTruthy();
      expect(() => getByDisplayValue('Account A edited secret')).toThrow();

      mockGetDraft.mockImplementation(() => 'Local draft');
      await act(async () => {
        rerender(
          <ChatInput
            {...defaultProps}
            draftKey="conversation-1"
            draftProvenance={{ scope: 'local' }}
          />,
        );
      });

      expect(getByDisplayValue('Local draft')).toBeTruthy();
      expect(() => getByDisplayValue('Account B draft')).toThrow();

      mockSetDraft.mockClear();
      await act(async () => {
        rerender(<ChatInput {...defaultProps} draftKey="conversation-1" />);
      });

      expect(getByLabelText('Message input').props.value).toBe('');
      expect(() => getByDisplayValue('Local draft')).toThrow();
      expect(mockSetDraft).not.toHaveBeenCalled();
    });

    it('carries no Local text or attachment into a Cloud new chat', async () => {
      const attachRef = React.createRef<ChatInputHandle>();
      const onSend = jest.fn();
      const { getByLabelText, rerender } = renderInput({
        onSend,
        attachRef,
        draftKey: 'new-chat',
        draftProvenance: { scope: 'local' },
      });
      fireEvent.changeText(getByLabelText('Message input'), 'private local notes');
      act(() => {
        attachRef.current?.addAttachments([
          {
            id: 'local-file',
            uri: 'file:///local/notes.txt',
            mimeType: 'text/plain',
            fileName: 'notes.txt',
            fileSize: 12,
          },
        ]);
      });
      expect(capturedAttachmentPreviewProps?.attachments).toHaveLength(1);

      await act(async () => {
        rerender(
          <ChatInput
            {...defaultProps}
            onSend={onSend}
            attachRef={attachRef}
            draftKey="new-chat"
            draftProvenance={{ scope: 'cloud', ownerId: 'account-a' }}
          />,
        );
      });

      expect(getByLabelText('Message input').props.value).toBe('');
      expect(capturedAttachmentPreviewProps?.attachments).toHaveLength(0);
      expect(onSend).not.toHaveBeenCalled();
    });

    it('renders and persists no unowned draft', () => {
      const { getByLabelText } = renderInput({
        draftKey: 'conversation-1',
        initialText: 'unowned carry-over',
      });

      expect(getByLabelText('Message input').props.value).toBe('');
      expect(mockGetDraft).not.toHaveBeenCalled();
      expect(mockSetDraft).not.toHaveBeenCalled();
    });
  });

  describe('button presence', () => {
    it('renders [+] button', () => {
      const { getByLabelText } = renderInput();
      expect(getByLabelText('Add to chat')).toBeTruthy();
    });

    it('hides [+] on a surface that cannot accept attachments', () => {
      const { queryByLabelText } = renderInput({ onOpenAddToChat: undefined });
      expect(queryByLabelText('Add to chat')).toBeNull();
    });

    it('renders the model label before anything is typed', () => {
      const { getByTestId } = renderInput();
      expect(getByTestId('chat.composer.model')).toBeTruthy();
    });

    it('renders mic button', () => {
      const { getByTestId } = renderInput();
      expect(getByTestId('voice-input-button')).toBeTruthy();
    });

    it('renders voice-mode button when composer is empty and onOpenVoiceMode is set', () => {
      const { getByLabelText } = renderInput();
      expect(getByLabelText('Start voice mode')).toBeTruthy();
    });

    it('renders send button once the composer has content', () => {
      const { getByLabelText, getByTestId } = renderInput();
      fireEvent.changeText(getByLabelText('Message input'), 'Hello');
      expect(getByTestId('send-button')).toBeTruthy();
    });
  });

  describe('attachment send failure', () => {
    it.each([true, false])(
      'preserves a rejected Cloud message and files when isOnline=%s',
      async (isOnline) => {
        mockAppMode = 'cloud';
        mockIsClerkSignedIn = true;
        const onSend = jest
          .fn()
          .mockImplementation(() => (isOnline ? Promise.resolve(false) : false));
        const attachRef = React.createRef<ChatInputHandle>();
        const { getByLabelText, getByTestId } = renderInput({
          onSend,
          attachRef,
          isOnline,
          draftKey: 'cloud-conversation-1',
          draftProvenance: { scope: 'cloud', ownerId: 'account-a' },
        });

        await act(async () => {
          attachRef.current?.addAttachments([
            {
              id: 'a-1',
              uri: 'file:///doc.pdf',
              mimeType: 'application/pdf',
              fileName: 'doc.pdf',
              fileSize: 1024,
            },
          ]);
        });

        fireEvent.changeText(getByLabelText('Message input'), 'read this');
        await act(async () => {
          fireEvent.press(getByTestId('send-button'));
        });

        await waitFor(() => {
          expect(
            capturedAttachmentPreviewProps?.attachments.find((a) => a.id === 'a-1')?.sendFailed,
          ).toBe(true);
        });
        expect(onSend).toHaveBeenCalledTimes(1);
        expect(onSend).toHaveBeenCalledWith('read this', [
          expect.objectContaining({ id: 'a-1', uri: 'file:///doc.pdf' }),
        ]);
        expect(getByLabelText('Message input').props.value).toBe('read this');
        expect(capturedAttachmentPreviewProps?.attachments).toEqual([
          expect.objectContaining({ id: 'a-1', fileName: 'doc.pdf', sendFailed: true }),
        ]);
        expect(mockDraftStore.clearDraft).not.toHaveBeenCalled();
        const sentAttachments = onSend.mock.calls[0][1] as Array<Record<string, unknown>>;
        expect(sentAttachments[0]).not.toHaveProperty('sendFailed');
      },
    );
  });

  describe('a Cloud upload the person declines', () => {
    const photo = {
      id: 'photo-declined',
      uri: 'file:///cache/attachment-1-0.jpg',
      mimeType: 'image/jpeg',
      fileName: 'IMG_0001.jpg',
      fileSize: 2048,
    };
    let alert: jest.SpyInstance;

    beforeEach(() => {
      mockAppMode = 'cloud';
      mockIsClerkSignedIn = true;
      alert = jest.spyOn(Alert, 'alert').mockImplementation((title, _message, buttons) => {
        if (title !== 'Send files to AGI Cloud?') return;
        buttons?.find((button) => button.text === 'Cancel')?.onPress?.();
      });
    });

    afterEach(() => {
      alert.mockRestore();
    });

    const sendAskingFirst = jest.fn(async (_text: string, attachments?: Attachment[]) =>
      attachments ? confirmCloudUpload(attachments) : true,
    );

    it('leaves the message and the photo in the composer as they were, with nothing marked unsent', async () => {
      const attachRef = React.createRef<ChatInputHandle>();
      const { getByLabelText, getByTestId } = renderInput({
        onSend: sendAskingFirst,
        attachRef,
        draftKey: 'cloud-conversation-1',
        draftProvenance: { scope: 'cloud', ownerId: 'account-a' },
      });
      await act(async () => {
        attachRef.current?.addAttachments([photo]);
      });
      fireEvent.changeText(getByLabelText('Message input'), 'what is this');

      await act(async () => {
        fireEvent.press(getByTestId('send-button'));
      });

      expect(sendAskingFirst).toHaveBeenCalledTimes(1);
      expect(alert).toHaveBeenCalledWith(
        'Send files to AGI Cloud?',
        expect.stringContaining('IMG_0001.jpg'),
        expect.any(Array),
        expect.any(Object),
      );
      expect(getByLabelText('Message input').props.value).toBe('what is this');
      expect(capturedAttachmentPreviewProps?.attachments).toEqual([
        expect.objectContaining({ id: 'photo-declined', fileName: 'IMG_0001.jpg' }),
      ]);
      expect(capturedAttachmentPreviewProps?.attachments[0]?.sendFailed).toBeFalsy();
      expect(mockDraftStore.clearDraft).not.toHaveBeenCalled();
    });

    it('keeps an earlier Not sent mark exactly where it was', async () => {
      const attachRef = React.createRef<ChatInputHandle>();
      const onSend = jest.fn().mockResolvedValueOnce(false).mockImplementation(sendAskingFirst);
      const { getByLabelText, getByTestId } = renderInput({
        onSend,
        attachRef,
        draftKey: 'cloud-conversation-1',
        draftProvenance: { scope: 'cloud', ownerId: 'account-a' },
      });
      await act(async () => {
        attachRef.current?.addAttachments([photo]);
      });
      fireEvent.changeText(getByLabelText('Message input'), 'what is this');
      await act(async () => {
        fireEvent.press(getByTestId('send-button'));
      });
      expect(capturedAttachmentPreviewProps?.attachments[0]?.sendFailed).toBe(true);

      await act(async () => {
        attachRef.current?.addAttachments([
          {
            ...photo,
            id: 'photo-second',
            uri: 'file:///cache/attachment-2-0.jpg',
            fileName: 'IMG_0002.jpg',
          },
        ]);
      });
      await act(async () => {
        fireEvent.press(getByTestId('send-button'));
      });

      expect(onSend).toHaveBeenCalledTimes(2);
      expect(
        capturedAttachmentPreviewProps?.attachments.map((item) => [item.id, !!item.sendFailed]),
      ).toEqual([
        ['photo-declined', true],
        ['photo-second', false],
      ]);
    });

    it('puts a queued message back in the composer, unmarked, when its upload is declined later', async () => {
      const attachRef = React.createRef<ChatInputHandle>();
      const props = {
        onSend: sendAskingFirst,
        attachRef,
        draftKey: 'cloud-conversation-1',
        draftProvenance: { scope: 'cloud' as const, ownerId: 'account-a' },
      };
      const view = renderInput({ ...props, isStreaming: true });
      await act(async () => {
        attachRef.current?.addAttachments([photo]);
      });
      fireEvent.changeText(view.getByLabelText('Message input'), 'and this one');
      fireEvent.press(view.getByLabelText('Queue message'));
      expect(view.getByLabelText('Message input').props.value).toBe('');

      await act(async () => {
        view.rerender(<ChatInput {...defaultProps} {...props} isStreaming={false} />);
      });

      expect(sendAskingFirst).toHaveBeenCalledTimes(1);
      expect(view.getByLabelText('Message input').props.value).toBe('and this one');
      expect(capturedAttachmentPreviewProps?.attachments).toEqual([
        expect.objectContaining({ id: 'photo-declined' }),
      ]);
      expect(capturedAttachmentPreviewProps?.attachments[0]?.sendFailed).toBeFalsy();
    });
  });

  describe('attachment Retry context', () => {
    it('uploads a retried file under the receiving conversation, not the new-chat preference', async () => {
      const context = { conversationId: 'conversation-1', temporary: false };
      mockResolveUploadContext.mockReturnValue(context);
      mockUploadWithRetry.mockResolvedValue(null);
      const attachRef = React.createRef<ChatInputHandle>();
      renderInput({ attachRef, conversationId: 'conversation-1' });

      await act(async () => {
        attachRef.current?.addAttachments([
          {
            id: 'a-1',
            uri: 'file:///doc.pdf',
            mimeType: 'application/pdf',
            fileName: 'doc.pdf',
            fileSize: 1024,
          },
        ]);
      });
      await act(async () => {
        capturedAttachmentPreviewProps?.onRetryUpload?.('a-1');
      });

      expect(mockResolveUploadContext).toHaveBeenCalledWith('conversation-1');
      expect(mockUploadWithRetry).toHaveBeenCalledWith(
        { uri: 'file:///doc.pdf', name: 'doc.pdf', type: 'application/pdf' },
        'doc.pdf',
        'a-1',
        context,
      );
    });
  });

  describe('[+] button', () => {
    it('calls onOpenAddToChat when pressed', () => {
      const onOpenAddToChat = jest.fn();
      const { getByLabelText } = renderInput({ onOpenAddToChat });

      fireEvent.press(getByLabelText('Add to chat'));

      expect(onOpenAddToChat).toHaveBeenCalledTimes(1);
    });
  });

  describe('active Cloud tools', () => {
    it('never shows a Web Search chip, even for an eligible signed-in Cloud chat', () => {
      mockAppMode = 'cloud';
      mockIsClerkSignedIn = true;
      mockTierState = {
        tier: 'pro',
        grantedCapabilities: ['canUseWebSearch'],
        codeExecutionAvailable: false,
        genericWebSearchAvailable: true,
      };

      const { queryByLabelText, rerender } = renderInput();

      expect(queryByLabelText('Web Search active')).toBeNull();

      mockAppMode = 'local';
      rerender(<ChatInput {...defaultProps} />);
      expect(queryByLabelText('Web Search active')).toBeNull();

      mockAppMode = 'cloud';
      mockIsClerkSignedIn = false;
      rerender(<ChatInput {...defaultProps} />);
      expect(queryByLabelText('Web Search active')).toBeNull();
    });

    it('keeps enabled Research and Run code options visible after the sheet closes', () => {
      mockAppMode = 'cloud';
      mockIsClerkSignedIn = true;
      mockChatFeatures = {
        ...mockChatFeatures,
        research: true,
        codeExecution: true,
        imageGen: true,
      };
      mockTierState = {
        tier: 'pro',
        grantedCapabilities: [
          'canUseWebSearch',
          'canUseDeepResearch',
          'canUseCloudExecution',
          'canUseImages',
        ],
        codeExecutionAvailable: true,
        genericWebSearchAvailable: true,
      };
      useChatViewStore.getState().setRunCode(NEW_CHAT_STYLE_KEY, true);

      const { getByLabelText, queryByLabelText, rerender } = renderInput();

      expect(getByLabelText('Deep Research active')).toBeTruthy();
      expect(getByLabelText('Run code on')).toBeTruthy();
      expect(queryByLabelText('Code execution active')).toBeNull();
      expect(queryByLabelText('Image generation active')).toBeNull();

      mockChatFeatures = {
        ...mockChatFeatures,
        research: false,
        codeExecution: false,
        imageGen: false,
      };
      rerender(<ChatInput {...defaultProps} />);

      expect(queryByLabelText('Deep Research active')).toBeNull();
      expect(queryByLabelText('Run code on')).toBeNull();
      expect(queryByLabelText('Image generation active')).toBeNull();
    });

    it('shows no Run code chip while code execution is only permitted, not requested', () => {
      mockAppMode = 'cloud';
      mockIsClerkSignedIn = true;
      mockChatFeatures = { ...mockChatFeatures, codeExecution: true };
      mockTierState = {
        tier: 'pro',
        grantedCapabilities: ['canUseCloudExecution'],
        codeExecutionAvailable: true,
        genericWebSearchAvailable: false,
      };
      useChatViewStore.getState().setRunCode('another-conversation', true);

      const { queryByLabelText } = renderInput();

      expect(queryByLabelText('Run code on')).toBeNull();
      expect(queryByLabelText('Code execution active')).toBeNull();
    });

    it('dismisses the keyboard when opening the + sheet', () => {
      const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
      const onOpenAddToChat = jest.fn();

      const { getAllByLabelText } = renderInput({ onOpenAddToChat });
      fireEvent.press(getAllByLabelText('Add to chat')[0]!);

      expect(dismiss).toHaveBeenCalled();
      expect(onOpenAddToChat).toHaveBeenCalled();
      dismiss.mockRestore();
    });

    it('never shows an Image status chip, even fully entitled with imageGen on', () => {
      mockAppMode = 'cloud';
      mockIsClerkSignedIn = true;
      mockChatFeatures = { ...mockChatFeatures, imageGen: true };
      mockTierState = {
        tier: 'pro',
        grantedCapabilities: ['canUseImages'],
        codeExecutionAvailable: false,
        genericWebSearchAvailable: false,
      };

      const { queryByLabelText } = renderInput();

      expect(queryByLabelText('Image generation active')).toBeNull();
    });
  });

  describe('reasoning effort', () => {
    it('offers the effort button in Cloud for a model with effort levels, not on device', () => {
      mockSelectedModel = effortModelId;
      mockAppMode = 'cloud';
      const cloud = renderInput();
      expect(cloud.getByTestId('chat.composer.effort')).toBeTruthy();
      cloud.unmount();

      mockAppMode = 'local';
      const local = renderInput();
      expect(local.queryByTestId('chat.composer.effort')).toBeNull();
    });

    it('turns into the effort slider in place and back to the message on Done', () => {
      mockSelectedModel = effortModelId;
      mockAppMode = 'cloud';
      const { getByTestId, queryByTestId, queryByLabelText } = renderInput();

      fireEvent.press(getByTestId('chat.composer.effort'));

      expect(getByTestId('chat.composer.effort-panel')).toBeTruthy();
      expect(queryByLabelText('Message input')).toBeNull();
      expect(queryByTestId('chat.composer.model')).toBeNull();

      fireEvent.press(getByTestId('chat.composer.effort-done'));

      expect(queryByTestId('chat.composer.effort-panel')).toBeNull();
      expect(queryByLabelText('Message input')).toBeTruthy();
      expect(getByTestId('chat.composer.model')).toBeTruthy();
    });
  });

  describe('streaming state', () => {
    it('labels an entitled Cloud Work composer without changing Local chat copy', () => {
      mockAppMode = 'cloud';
      mockIsClerkSignedIn = true;
      mockTierState = { ...mockTierState, tier: 'pro' };
      useChatViewStore.setState({ workMode: 'agiwork' });

      const cloud = renderInput();
      expect(cloud.getByLabelText('Message input').props.placeholder).toBe('Work with AGI');
      cloud.unmount();

      mockAppMode = 'local';
      const local = renderInput();
      expect(local.getByLabelText('Message input').props.placeholder).toBe("What's on your mind?");
    });

    it('keeps the thread placeholder during streaming instead of naming the composer selection', () => {
      const { getByLabelText } = renderInput({ isStreaming: true });

      const input = getByLabelText('Message input');
      expect(input.props.placeholder).toBe('Reply to AGI');
    });

    it('shows stop button instead of send during streaming', () => {
      const { getByLabelText } = renderInput({ isStreaming: true });

      expect(getByLabelText('Stop generating')).toBeTruthy();
    });
  });

  describe('sending messages', () => {
    it('send button triggers onSend with text', async () => {
      const onSend = jest.fn();
      const { getByLabelText, getByTestId } = renderInput({ onSend });

      const input = getByLabelText('Message input');
      fireEvent.changeText(input, 'Hello world');

      await act(async () => {
        fireEvent.press(getByTestId('send-button'));
      });

      expect(onSend).toHaveBeenCalledWith('Hello world', undefined);
    });

    it('empties the field on tap, while the field and the phone still agree, and keeps it empty once accepted', async () => {
      let resolveSend!: (accepted: boolean) => void;
      const onSend = jest.fn(() => new Promise<boolean>((resolve) => (resolveSend = resolve)));
      const { getByLabelText, getByTestId } = renderInput({ onSend });

      fireEvent.changeText(getByLabelText('Message input'), 'Draft-safe message');
      fireEvent.press(getByTestId('send-button'));

      expect(getByLabelText('Message input').props.value).toBe('');

      await act(async () => {
        resolveSend(true);
      });

      expect(getByLabelText('Message input').props.value).toBe('');
    });

    it('puts the message back when the send is refused after the field was emptied', async () => {
      let resolveSend!: (accepted: boolean) => void;
      const onSend = jest.fn(() => new Promise<boolean>((resolve) => (resolveSend = resolve)));
      const { getByLabelText, getByTestId } = renderInput({ onSend });

      fireEvent.changeText(getByLabelText('Message input'), 'Book the room');
      fireEvent.press(getByTestId('send-button'));
      fireEvent.changeText(getByLabelText('Message input'), 'for Friday');

      await act(async () => {
        resolveSend(false);
      });

      expect(getByLabelText('Message input').props.value).toBe('Book the room\n\nfor Friday');
    });

    it('puts the message back in the chat it came from when that chat was left before the refusal', async () => {
      let resolveSend!: (accepted: boolean) => void;
      const onSend = jest.fn(() => new Promise<boolean>((resolve) => (resolveSend = resolve)));
      const local = { scope: 'local' as const };
      const view = renderInput({
        onSend,
        draftKey: 'conversation-1',
        conversationId: 'conversation-1',
        draftProvenance: local,
      });

      fireEvent.changeText(view.getByLabelText('Message input'), 'Book the room');
      fireEvent.press(view.getByTestId('send-button'));
      view.rerender(
        <ChatInput
          {...defaultProps}
          onSend={onSend}
          draftKey="conversation-2"
          conversationId="conversation-2"
          draftProvenance={local}
        />,
      );
      mockSetDraft.mockClear();

      await act(async () => {
        resolveSend(false);
      });

      expect(mockSetDraft).toHaveBeenCalledWith('conversation-1', 'Book the room', local, []);
      expect(view.getByLabelText('Message input').props.value).toBe('');
    });

    it('puts the message back in the stored draft when the composer closed before the refusal', async () => {
      let resolveSend!: (accepted: boolean) => void;
      const onSend = jest.fn(() => new Promise<boolean>((resolve) => (resolveSend = resolve)));
      const local = { scope: 'local' as const };
      const view = renderInput({
        onSend,
        draftKey: 'conversation-1',
        conversationId: 'conversation-1',
        draftProvenance: local,
      });

      fireEvent.changeText(view.getByLabelText('Message input'), 'Book the room');
      fireEvent.press(view.getByTestId('send-button'));
      view.unmount();
      mockSetDraft.mockClear();

      await act(async () => {
        resolveSend(false);
      });

      expect(mockSetDraft).toHaveBeenCalledWith('conversation-1', 'Book the room', local, []);
    });

    it('puts the message back when the send handler throws before it returns', async () => {
      const onSend = jest.fn(() => {
        throw new Error('not ready');
      });
      const { getByLabelText, getByTestId } = renderInput({ onSend });

      fireEvent.changeText(getByLabelText('Message input'), 'Try once more');
      await act(async () => {
        fireEvent.press(getByTestId('send-button'));
      });

      expect(getByLabelText('Message input').props.value).toBe('Try once more');
    });

    it('still clears when iOS commits an autocorrect on the last word while the send is pending', async () => {
      let resolveSend!: (accepted: boolean) => void;
      const onSend = jest.fn(() => new Promise<boolean>((resolve) => (resolveSend = resolve)));
      const { getByLabelText, getByTestId } = renderInput({ onSend });

      const input = getByLabelText('Message input');
      fireEvent.changeText(input, 'Make 3 flash card');
      fireEvent.press(getByTestId('send-button'));
      fireEvent.changeText(getByLabelText('Message input'), 'Make 3 flash cards ');

      await act(async () => {
        resolveSend(true);
      });

      expect(onSend).toHaveBeenCalledWith('Make 3 flash card', undefined);
      expect(getByLabelText('Message input').props.value).toBe('');
    });

    it('keeps the composer empty when the autocorrect commit arrives after the clear', async () => {
      const onSend = jest.fn(() => Promise.resolve(true));
      const { getByLabelText, getByTestId } = renderInput({ onSend });

      fireEvent.changeText(
        getByLabelText('Message input'),
        'Quiz me with 2 multiple choice questio',
      );
      await act(async () => {
        fireEvent.press(getByTestId('send-button'));
      });
      expect(getByLabelText('Message input').props.value).toBe('');

      fireEvent.changeText(
        getByLabelText('Message input'),
        'Quiz me with 2 multiple choice questions ',
      );
      expect(getByLabelText('Message input').props.value).toBe('');

      fireEvent.changeText(getByLabelText('Message input'), 'N');
      fireEvent.changeText(getByLabelText('Message input'), 'Next');
      expect(getByLabelText('Message input').props.value).toBe('Next');
    });

    describe('after the autocorrect commit window', () => {
      let now = 1_000_000;
      let dateNow: jest.SpyInstance<number, []>;
      beforeEach(() => {
        now = 1_000_000;
        dateNow = jest.spyOn(Date, 'now').mockImplementation(() => now);
      });
      afterEach(() => {
        dateNow.mockRestore();
      });

      async function sendFromComposer(sent: string) {
        const onSend = jest.fn(() => Promise.resolve(true));
        const screen = renderInput({ onSend });
        fireEvent.changeText(screen.getByLabelText('Message input'), sent);
        await act(async () => {
          fireEvent.press(screen.getByTestId('send-button'));
        });
        expect(screen.getByLabelText('Message input').props.value).toBe('');
        return screen;
      }

      it('keeps a pasted link that starts with the letter of a one-word send', async () => {
        const { getByLabelText } = await sendFromComposer('Hello');
        now += 1_000;

        fireEvent.changeText(getByLabelText('Message input'), 'https://example.com/report.pdf');

        expect(getByLabelText('Message input').props.value).toBe('https://example.com/report.pdf');
      });

      it('keeps the same prompt pasted again', async () => {
        const { getByLabelText } = await sendFromComposer('Summarize this page');
        now += 1_000;

        fireEvent.changeText(getByLabelText('Message input'), 'Summarize this page');

        expect(getByLabelText('Message input').props.value).toBe('Summarize this page');
      });

      it('drops the sent text only once', async () => {
        const { getByLabelText } = await sendFromComposer('Make 3 flash card');

        fireEvent.changeText(getByLabelText('Message input'), 'Make 3 flash cards ');
        expect(getByLabelText('Message input').props.value).toBe('');

        fireEvent.changeText(getByLabelText('Message input'), 'Make 3 flash cards ');
        expect(getByLabelText('Message input').props.value).toBe('Make 3 flash cards ');
      });
    });

    it('keeps new words typed while the send was pending', async () => {
      let resolveSend!: (accepted: boolean) => void;
      const onSend = jest.fn(() => new Promise<boolean>((resolve) => (resolveSend = resolve)));
      const { getByLabelText, getByTestId } = renderInput({ onSend });

      fireEvent.changeText(getByLabelText('Message input'), 'First question');
      fireEvent.press(getByTestId('send-button'));
      fireEvent.changeText(getByLabelText('Message input'), 'First question and more');

      await act(async () => {
        resolveSend(true);
      });

      expect(getByLabelText('Message input').props.value).toBe('and more');
    });

    describe('when typing goes on after Send', () => {
      const sent = 'Write a 400 word story about a lighthouse';
      const typedOn = `${sent} keeper. No web search.`;

      beforeEach(() => {
        jest.useFakeTimers();
      });
      afterEach(() => {
        jest.useRealTimers();
      });

      function pendingSend<T>() {
        let resolveSend!: (outcome: T) => void;
        const onSend = jest.fn(() => new Promise<T>((resolve) => (resolveSend = resolve)));
        return { onSend, resolve: (outcome: T) => resolveSend(outcome) };
      }

      function storedTextsFor(key: string): string[] {
        return mockSetDraft.mock.calls
          .filter(([draftKey]) => draftKey === key)
          .map(([, text]) => text as string);
      }

      it('never writes the sent words back to the draft once the send is accepted', async () => {
        const send = pendingSend<boolean>();
        const { getByLabelText, getByTestId } = renderInput({
          onSend: send.onSend,
          draftKey: 'conversation-1',
          conversationId: 'conversation-1',
          draftProvenance: { scope: 'local' },
        });

        fireEvent.changeText(getByLabelText('Message input'), sent);
        fireEvent.press(getByTestId('send-button'));
        fireEvent.changeText(getByLabelText('Message input'), typedOn);
        const writesBeforeAccept = mockSetDraft.mock.calls.length;

        await act(async () => {
          send.resolve(true);
        });
        act(() => {
          jest.advanceTimersByTime(10_000);
        });

        expect(send.onSend).toHaveBeenCalledWith(sent, undefined);
        expect(getByLabelText('Message input').props.value).toBe('keeper. No web search.');
        const laterWrites = storedTextsFor('conversation-1').slice(writesBeforeAccept);
        expect(laterWrites.length).toBeGreaterThan(0);
        expect(laterWrites.every((text) => !text.includes(sent))).toBe(true);
        expect(laterWrites.at(-1)).toBe('keeper. No web search.');
      });

      it('hands text typed after a new chat send to the chat that send opened', async () => {
        const send = pendingSend<{ openedConversationId: string }>();
        const { getByLabelText, getByTestId } = renderInput({
          onSend: send.onSend,
          draftKey: 'new-chat',
          draftProvenance: { scope: 'local' },
        });

        fireEvent.changeText(getByLabelText('Message input'), sent);
        fireEvent.press(getByTestId('send-button'));
        fireEvent.changeText(getByLabelText('Message input'), typedOn);
        const writesBeforeAccept = mockSetDraft.mock.calls.length;

        await act(async () => {
          send.resolve({ openedConversationId: 'conversation-9' });
        });

        expect(getByLabelText('Message input').props.value).toBe('');
        expect(useComposerPrefillStore.getState().pending['conversation-9']).toBe(
          'keeper. No web search.',
        );
        const laterWrites = storedTextsFor('new-chat').slice(writesBeforeAccept);
        expect(laterWrites.length).toBeGreaterThan(0);
        expect(laterWrites.every((text) => text === '')).toBe(true);
        useComposerPrefillStore.setState({ pending: {} });
      });

      it('drops the sent words from keystrokes still on their way when the send was accepted', async () => {
        const send = pendingSend<boolean>();
        const { getByLabelText, getByTestId } = renderInput({
          onSend: send.onSend,
          draftKey: 'conversation-1',
          conversationId: 'conversation-1',
          draftProvenance: { scope: 'local' },
        });

        fireEvent.changeText(getByLabelText('Message input'), sent);
        fireEvent.press(getByTestId('send-button'));
        fireEvent.changeText(getByLabelText('Message input'), typedOn);
        await act(async () => {
          send.resolve(true);
        });
        const writesAfterAccept = mockSetDraft.mock.calls.length;

        fireEvent.changeText(getByLabelText('Message input'), `${typedOn}!`);
        expect(getByLabelText('Message input').props.value).toBe('keeper. No web search.!');
        fireEvent.changeText(getByLabelText('Message input'), `${typedOn}!?`);
        expect(getByLabelText('Message input').props.value).toBe('keeper. No web search.!?');
        fireEvent.changeText(getByLabelText('Message input'), 'keeper. No web search.!? Go');
        expect(getByLabelText('Message input').props.value).toBe('keeper. No web search.!? Go');

        const laterWrites = storedTextsFor('conversation-1').slice(writesAfterAccept);
        expect(laterWrites.length).toBeGreaterThan(0);
        expect(laterWrites.every((text) => !text.includes(sent))).toBe(true);
      });

      it('hands keystrokes still on their way to the chat a new chat send opened', async () => {
        const blur = jest.spyOn(TextInput.prototype, 'blur');
        try {
          const send = pendingSend<{ openedConversationId: string }>();
          const { getByLabelText, getByTestId } = renderInput({
            onSend: send.onSend,
            draftKey: 'new-chat',
            draftProvenance: { scope: 'local' },
          });

          fireEvent.changeText(getByLabelText('Message input'), sent);
          fireEvent.press(getByTestId('send-button'));
          fireEvent.changeText(getByLabelText('Message input'), typedOn);
          const writesBeforeAccept = mockSetDraft.mock.calls.length;
          await act(async () => {
            send.resolve({ openedConversationId: 'conversation-9' });
          });
          expect(blur).toHaveBeenCalled();

          fireEvent.changeText(getByLabelText('Message input'), `${typedOn}!`);
          expect(getByLabelText('Message input').props.value).toBe('');
          expect(useComposerPrefillStore.getState().pending['conversation-9']).toBe(
            'keeper. No web search.!',
          );

          act(() => useComposerPrefillStore.getState().consume('conversation-9'));
          fireEvent.changeText(getByLabelText('Message input'), `${typedOn}!?`);
          expect(getByLabelText('Message input').props.value).toBe('');
          expect(useComposerPrefillStore.getState().pending['conversation-9']).toBe('?');

          const laterWrites = storedTextsFor('new-chat').slice(writesBeforeAccept);
          expect(laterWrites.length).toBeGreaterThan(0);
          expect(laterWrites.every((text) => text === '')).toBe(true);
        } finally {
          blur.mockRestore();
          useComposerPrefillStore.setState({ pending: {} });
        }
      });

      describe('when the new chat opens before the send is accepted', () => {
        const local = { scope: 'local' as const };

        function NewChatAndOpenedChat({
          onSend,
          attachRef,
          opened,
        }: {
          onSend: React.ComponentProps<typeof ChatInput>['onSend'];
          attachRef: React.RefObject<ChatInputHandle | null>;
          opened?: string;
        }) {
          return (
            <>
              <ChatInput
                {...defaultProps}
                onSend={onSend}
                attachRef={attachRef}
                draftKey="new-chat"
                draftProvenance={local}
              />
              {opened ? (
                <ChatInput
                  {...defaultProps}
                  conversationId={opened}
                  draftKey={opened}
                  draftProvenance={local}
                />
              ) : null}
            </>
          );
        }

        function sendFromNewChat(onSend: React.ComponentProps<typeof ChatInput>['onSend']) {
          const attachRef = React.createRef<ChatInputHandle>();
          const view = render(<NewChatAndOpenedChat onSend={onSend} attachRef={attachRef} />);
          const inputs = () => view.getAllByLabelText('Message input');
          fireEvent.changeText(inputs()[0]!, sent);
          fireEvent.press(view.getByTestId('send-button'));
          let writesAtHandOver = 0;
          return {
            attachRef,
            newChatDraftsSinceHandOver: () =>
              mockSetDraft.mock.calls
                .slice(writesAtHandOver)
                .filter(([draftKey]) => draftKey === 'new-chat')
                .map(([, text]) => text as string),
            newChatInput: () => inputs()[0]!,
            openedInput: () => inputs()[1]!,
            typeInNewChat: (text: string) => fireEvent.changeText(inputs()[0]!, text),
            handOver: (conversationId: string) => {
              writesAtHandOver = mockSetDraft.mock.calls.length;
              act(() => attachRef.current?.handOverTypingTo?.(conversationId));
            },
            openChat: (conversationId: string) =>
              view.rerender(
                <NewChatAndOpenedChat
                  onSend={onSend}
                  attachRef={attachRef}
                  opened={conversationId}
                />,
              ),
          };
        }

        it('moves the words typed after Send into the chat it opened, in order, with the caret at the end', async () => {
          const isFocused = jest.spyOn(TextInput.prototype, 'isFocused').mockReturnValue(true);
          const focus = jest.spyOn(TextInput.prototype, 'focus');
          const originalRender = TextInput.prototype.render;
          const commits: Array<{ value?: string; selection?: { start: number; end?: number } }> =
            [];
          const renderSpy = jest
            .spyOn(TextInput.prototype, 'render')
            .mockImplementation(function (this: { props: Record<string, unknown> }) {
              commits.push({
                value: this.props.value as string | undefined,
                selection: this.props.selection as { start: number; end?: number } | undefined,
              });
              return originalRender.call(this);
            });
          try {
            const send = pendingSend<{ openedConversationId: string }>();
            const chat = sendFromNewChat(send.onSend);
            chat.typeInNewChat('tea');
            chat.handOver('conversation-9');
            focus.mockClear();

            chat.openChat('conversation-9');
            expect(chat.openedInput().props.value).toBe('tea');
            expect(focus).toHaveBeenCalled();
            expect(commits).toContainEqual({ value: 'tea', selection: { start: 3, end: 3 } });

            chat.typeInNewChat('tea milk');
            expect(chat.openedInput().props.value).toBe('tea milk');
            expect(commits).toContainEqual({ value: 'tea milk', selection: { start: 8, end: 8 } });
            fireEvent.changeText(chat.openedInput(), 'tea milk sugar');

            await act(async () => {
              send.resolve({ openedConversationId: 'conversation-9' });
            });

            expect(send.onSend).toHaveBeenCalledWith(sent, undefined);
            expect(chat.newChatInput().props.value).toBe('');
            expect(chat.openedInput().props.value).toBe('tea milk sugar');
            expect(chat.newChatDraftsSinceHandOver().length).toBeGreaterThan(0);
            expect(chat.newChatDraftsSinceHandOver().every((text) => !text.includes('tea'))).toBe(
              true,
            );
            expect(chat.newChatDraftsSinceHandOver().at(-1)).toBe('');
            expect(useComposerPrefillStore.getState().pending['conversation-9']).toBeUndefined();
          } finally {
            renderSpy.mockRestore();
            isFocused.mockRestore();
            focus.mockRestore();
          }
        });

        it('hands the keyboard to the chat it opened when nothing was typed after Send', async () => {
          const isFocused = jest.spyOn(TextInput.prototype, 'isFocused').mockReturnValue(true);
          const focus = jest.spyOn(TextInput.prototype, 'focus');
          const blur = jest.spyOn(TextInput.prototype, 'blur');
          try {
            const send = pendingSend<{ openedConversationId: string }>();
            const chat = sendFromNewChat(send.onSend);
            chat.handOver('conversation-9');
            focus.mockClear();

            chat.openChat('conversation-9');
            expect(focus).toHaveBeenCalledTimes(1);
            expect(chat.openedInput().props.value).toBe('');

            chat.typeInNewChat('b');
            expect(chat.openedInput().props.value).toBe('b');

            await act(async () => {
              send.resolve({ openedConversationId: 'conversation-9' });
            });
            expect(chat.newChatInput().props.value).toBe('');
            expect(chat.openedInput().props.value).toBe('b');
            expect(chat.newChatDraftsSinceHandOver().every((text) => text === '')).toBe(true);
            expect(blur).toHaveBeenCalled();
          } finally {
            isFocused.mockRestore();
            focus.mockRestore();
            blur.mockRestore();
          }
        });

        it('leaves the keyboard down in the chat it opened when it was down at Send', () => {
          const isFocused = jest.spyOn(TextInput.prototype, 'isFocused').mockReturnValue(false);
          const focus = jest.spyOn(TextInput.prototype, 'focus');
          try {
            const send = pendingSend<{ openedConversationId: string }>();
            const chat = sendFromNewChat(send.onSend);
            chat.handOver('conversation-9');
            focus.mockClear();

            chat.openChat('conversation-9');

            expect(focus).not.toHaveBeenCalled();
          } finally {
            isFocused.mockRestore();
            focus.mockRestore();
          }
        });

        it('gives back only the sent words when the send fails after the chat took the typing', async () => {
          const isFocused = jest.spyOn(TextInput.prototype, 'isFocused').mockReturnValue(true);
          try {
            const send = pendingSend<boolean>();
            const chat = sendFromNewChat(send.onSend);
            chat.typeInNewChat('tea');
            chat.handOver('conversation-9');
            chat.openChat('conversation-9');

            await act(async () => {
              send.resolve(false);
            });

            expect(chat.newChatInput().props.value).toBe(sent);
            expect(chat.openedInput().props.value).toBe('tea');
          } finally {
            isFocused.mockRestore();
          }
        });

        it('keeps the typing in the new chat when the send fails before that chat took it', async () => {
          const isFocused = jest.spyOn(TextInput.prototype, 'isFocused').mockReturnValue(true);
          try {
            const send = pendingSend<boolean>();
            const chat = sendFromNewChat(send.onSend);
            chat.typeInNewChat('tea');
            chat.handOver('conversation-9');

            await act(async () => {
              send.resolve(false);
            });
            chat.openChat('conversation-9');

            expect(chat.newChatInput().props.value).toBe(`${sent}\n\ntea`);
            expect(chat.openedInput().props.value).toBe('');
          } finally {
            isFocused.mockRestore();
          }
        });
      });

      it('drops the sent words from a keystroke still on its way when a follow-up is queued', () => {
        const onSend = jest.fn();
        const { getByLabelText } = renderInput({
          onSend,
          isStreaming: true,
          draftKey: 'conversation-1',
          conversationId: 'conversation-1',
          draftProvenance: { scope: 'local' },
        });

        fireEvent.changeText(getByLabelText('Message input'), 'Also check the dates');
        fireEvent.press(getByLabelText('Queue message'));
        fireEvent.changeText(getByLabelText('Message input'), 'Also check the dates and times');

        expect(getByLabelText('Message input').props.value).toBe('and times');
        expect(
          storedTextsFor('conversation-1').every(
            (text) => !text.includes('Also check the dates and times'),
          ),
        ).toBe(true);
      });

      it('drops the sent words when iOS corrected the last one and typing went on', async () => {
        const send = pendingSend<boolean>();
        const { getByLabelText, getByTestId } = renderInput({
          onSend: send.onSend,
          draftKey: 'conversation-1',
          conversationId: 'conversation-1',
          draftProvenance: { scope: 'local' },
        });

        fireEvent.changeText(getByLabelText('Message input'), 'Tell me about the lighthose');
        fireEvent.press(getByTestId('send-button'));
        fireEvent.changeText(getByLabelText('Message input'), 'Tell me about the lighthouse also');
        const writesBeforeAccept = mockSetDraft.mock.calls.length;
        await act(async () => {
          send.resolve(true);
        });

        expect(getByLabelText('Message input').props.value).toBe('also');
        const laterWrites = storedTextsFor('conversation-1').slice(writesBeforeAccept);
        expect(laterWrites.at(-1)).toBe('also');
      });

      it('keeps new text that only shares its first letter with a one word send', async () => {
        const send = pendingSend<boolean>();
        const { getByLabelText, getByTestId } = renderInput({ onSend: send.onSend });

        fireEvent.changeText(getByLabelText('Message input'), 'Hi');
        fireEvent.press(getByTestId('send-button'));
        await act(async () => {
          send.resolve(true);
        });
        fireEvent.changeText(getByLabelText('Message input'), 'Hello world');

        expect(getByLabelText('Message input').props.value).toBe('Hello world');
      });

      it('leaves another chat draft alone when the send it left behind is accepted', async () => {
        const send = pendingSend<boolean>();
        mockGetDraft.mockImplementation((key: string) =>
          key === 'conversation-2' ? 'Same words' : '',
        );
        const view = renderInput({
          onSend: send.onSend,
          draftKey: 'conversation-1',
          conversationId: 'conversation-1',
          draftProvenance: { scope: 'local' },
        });

        fireEvent.changeText(view.getByLabelText('Message input'), 'Same words');
        fireEvent.press(view.getByTestId('send-button'));
        view.rerender(
          <ChatInput
            {...defaultProps}
            onSend={send.onSend}
            draftKey="conversation-2"
            conversationId="conversation-2"
            draftProvenance={{ scope: 'local' }}
          />,
        );
        expect(view.getByLabelText('Message input').props.value).toBe('Same words');

        await act(async () => {
          send.resolve(true);
        });

        expect(view.getByLabelText('Message input').props.value).toBe('Same words');
        mockGetDraft.mockImplementation(() => '');
      });
    });

    describe('on a phone, where the field ignores a value set while typing is ahead of JS', () => {
      const sent = 'Reply with the single word yes';
      const local = { scope: 'local' as const };
      let now = 1_000_000;
      let dateNow: jest.SpyInstance<number, []>;

      beforeEach(() => {
        now = 1_000_000;
        dateNow = jest.spyOn(Date, 'now').mockImplementation(() => now);
      });
      afterEach(() => {
        dateNow.mockRestore();
        mockSetDraft.mockReset();
        mockDraftStore.clearDraft.mockReset();
        mockGetDraft.mockReset();
        mockGetDraft.mockReturnValue('');
      });

      function rememberDrafts() {
        const stored = new Map<string, string>();
        mockSetDraft.mockImplementation((key: string, value: string) => {
          if (value.trim()) stored.set(key, value);
          else stored.delete(key);
        });
        mockGetDraft.mockImplementation((key: string) => stored.get(key) ?? '');
        mockDraftStore.clearDraft.mockImplementation((key: string) => {
          stored.delete(key);
        });
        return stored;
      }

      function draftWritesFor(key: string, from: number): string[] {
        return mockSetDraft.mock.calls
          .slice(from)
          .filter(([draftKey]) => draftKey === key)
          .map(([, text]) => text as string);
      }

      // Models the native side of a controlled TextInput as React Native 0.86
      // runs it: every keystroke raises the field's event count, JS learns the
      // count only from the change event, and a value pushed from JS is applied
      // only when the count JS last saw is still the field's count
      // (setTextAndSelection in RCTTextInputComponentView.mm and ReactEditText).
      function phoneField(input: () => ReturnType<typeof renderedScreen.getByLabelText>) {
        let shown = '';
        let fieldCount = 0;
        let seenCount = 0;
        let lastKnownToJs = '';
        const inFlight: Array<{ text: string; count: number }> = [];
        const pushFromJs = () => {
          const value: string = input().props.value ?? '';
          if (value === lastKnownToJs) return;
          lastKnownToJs = value;
          if (seenCount === fieldCount) shown = value;
        };
        return {
          get shown() {
            return shown;
          },
          type(chars: string) {
            for (const char of chars) {
              shown += char;
              fieldCount += 1;
              inFlight.push({ text: shown, count: fieldCount });
            }
          },
          deliver(count = inFlight.length) {
            for (let index = 0; index < count && inFlight.length > 0; index += 1) {
              const event = inFlight.shift()!;
              fireEvent.changeText(input(), event.text);
              lastKnownToJs = event.text;
              seenCount = event.count;
              pushFromJs();
            }
          },
          pushFromJs,
        };
      }

      function pendingSend() {
        let resolve!: (accepted: boolean) => void;
        const onSend = jest.fn(() => new Promise<boolean>((accept) => (resolve = accept)));
        return { onSend, resolve: (accepted: boolean) => resolve(accepted) };
      }

      it('holds only the words typed after Send, also after the chat is left and opened again', async () => {
        const stored = rememberDrafts();
        const send = pendingSend();
        const view = renderInput({
          onSend: send.onSend,
          draftKey: 'conversation-1',
          conversationId: 'conversation-1',
          draftProvenance: local,
        });
        const field = phoneField(() => view.getByLabelText('Message input'));
        field.type(sent);
        field.deliver();

        fireEvent.press(view.getByTestId('send-button'));
        field.pushFromJs();
        expect(field.shown).toBe('');
        const writesAfterSend = mockSetDraft.mock.calls.length;

        const next = 'three more words';
        for (const [index, char] of [...next].entries()) {
          now += 150;
          field.type(char);
          if (index >= 2) field.deliver(1);
          if (index === 4) {
            await act(async () => {
              send.resolve(true);
            });
            field.pushFromJs();
          }
        }
        now += 7_000;
        field.deliver();

        expect(send.onSend).toHaveBeenCalledWith(sent, undefined);
        expect(field.shown).toBe(next);
        expect(view.getByLabelText('Message input').props.value).toBe(next);
        expect(
          draftWritesFor('conversation-1', writesAfterSend).some((text) => text.includes(sent)),
        ).toBe(false);
        view.unmount();

        const reopened = renderInput({
          onSend: send.onSend,
          draftKey: 'conversation-1',
          conversationId: 'conversation-1',
          draftProvenance: local,
        });
        expect(stored.get('conversation-1')).toBe(next);
        expect(reopened.getByLabelText('Message input').props.value).toBe(next);
      });

      it('recovers when a keystroke was already on its way as Send was pressed and JS stays behind for seconds', async () => {
        rememberDrafts();
        const send = pendingSend();
        const view = renderInput({
          onSend: send.onSend,
          draftKey: 'conversation-1',
          conversationId: 'conversation-1',
          draftProvenance: local,
        });
        const field = phoneField(() => view.getByLabelText('Message input'));
        field.type(sent);
        field.deliver();

        field.type('t');
        fireEvent.press(view.getByTestId('send-button'));
        field.pushFromJs();
        expect(field.shown).toBe(`${sent}t`);
        const writesAfterSend = mockSetDraft.mock.calls.length;

        for (const [index, char] of [...'hree more words'].entries()) {
          now += 250;
          field.type(char);
          field.deliver(1);
          if (index === 3) {
            await act(async () => {
              send.resolve(true);
            });
            field.pushFromJs();
          }
        }
        field.deliver();

        expect(field.shown).toBe('three more words');
        expect(view.getByLabelText('Message input').props.value).toBe('three more words');
        expect(
          draftWritesFor('conversation-1', writesAfterSend).some((text) => text.includes(sent)),
        ).toBe(false);
      });

      it('keeps the words typed after Send apart from the sent ones when the message goes with an attachment', async () => {
        rememberDrafts();
        const send = pendingSend();
        const attachRef = React.createRef<ChatInputHandle>();
        const view = renderInput({
          onSend: send.onSend,
          attachRef,
          draftKey: 'conversation-1',
          conversationId: 'conversation-1',
          draftProvenance: local,
        });
        await act(async () => {
          attachRef.current?.addAttachments([
            {
              id: 'notes',
              uri: 'file:///notes.txt',
              mimeType: 'text/plain',
              fileName: 'notes.txt',
              fileSize: 12,
            },
          ]);
        });
        const field = phoneField(() => view.getByLabelText('Message input'));
        field.type(sent);
        field.deliver();

        fireEvent.press(view.getByTestId('send-button'));
        field.pushFromJs();
        expect(field.shown).toBe('');
        const writesAfterSend = mockSetDraft.mock.calls.length;

        field.type('and t');
        field.deliver(3);
        await act(async () => {
          send.resolve(true);
        });
        field.pushFromJs();
        field.type('hen');
        field.deliver();

        expect(send.onSend).toHaveBeenCalledWith(sent, [expect.objectContaining({ id: 'notes' })]);
        expect(field.shown).toBe('and then');
        expect(capturedAttachmentPreviewProps?.attachments).toEqual([]);
        expect(
          draftWritesFor('conversation-1', writesAfterSend).some((text) => text.includes(sent)),
        ).toBe(false);
      });

      it('keeps the words typed after queuing a follow-up apart from the queued one', async () => {
        rememberDrafts();
        const onSend = jest.fn(async () => true);
        const attachRef = React.createRef<ChatInputHandle>();
        const props = {
          onSend,
          attachRef,
          draftKey: 'conversation-1',
          conversationId: 'conversation-1',
          draftProvenance: local,
        };
        const view = renderInput({ ...props, isStreaming: true });
        await act(async () => {
          attachRef.current?.addAttachments([
            {
              id: 'notes',
              uri: 'file:///notes.txt',
              mimeType: 'text/plain',
              fileName: 'notes.txt',
              fileSize: 12,
            },
          ]);
        });
        const field = phoneField(() => view.getByLabelText('Message input'));
        field.type(sent);
        field.deliver();

        field.type('t');
        fireEvent.press(view.getByLabelText('Queue message'));
        field.pushFromJs();
        const writesAfterQueue = mockSetDraft.mock.calls.length;
        for (const char of 'hree more words') {
          now += 250;
          field.type(char);
          field.deliver(1);
        }
        field.deliver();

        expect(field.shown).toBe('three more words');
        expect(
          draftWritesFor('conversation-1', writesAfterQueue).some((text) =>
            text.includes(`${sent}t`),
          ),
        ).toBe(false);

        await act(async () => {
          view.rerender(<ChatInput {...defaultProps} {...props} isStreaming={false} />);
        });

        expect(onSend).toHaveBeenCalledWith(sent, [expect.objectContaining({ id: 'notes' })]);
        expect(mockSetDraft.mock.calls.at(-1)?.[1]).toBe('three more words');
      });

      describe('while JS is busy and takes the Send tap together with the keystrokes around it', () => {
        type Host = ReturnType<typeof renderedScreen.getByLabelText>;
        type Caret = { start: number; end?: number };

        function pressHandlerOf(element: Host): () => void {
          let node: Host | null = element;
          while (node && typeof node.props.onPress !== 'function') node = node.parent;
          if (!node) throw new Error('no press handler');
          return node.props.onPress as () => void;
        }

        let composerCommits: Array<{ value?: string; selection?: Caret }> = [];
        let renderSpy: jest.SpyInstance | null = null;

        afterEach(() => {
          renderSpy?.mockRestore();
          renderSpy = null;
          composerCommits = [];
        });

        // Models the native field more closely than phoneField: typing goes in
        // at the caret; each commit of the composer field runs React Native's
        // sync (useTextInputStateSynchronization in TextInput.js), whose text
        // and caret write lands only when JS has seen the field's latest
        // keystroke; a landed text without a caret request keeps the caret's
        // distance from the end (_setAttributedString in
        // RCTTextInputComponentView.mm); and events that queued up while JS was
        // busy reach the handlers of one render in a single batch, with the Send
        // tap among them, before React draws again (they are flushed in one task
        // and React renders in a microtask after it).
        function busyPhoneField(view: ReturnType<typeof renderInput>) {
          const input = () => view.getByLabelText('Message input');
          const originalRender = TextInput.prototype.render;
          renderSpy = jest.spyOn(TextInput.prototype, 'render').mockImplementation(function (this: {
            props: Record<string, unknown>;
          }) {
            if (this.props.testID === 'chat.composer.input') {
              composerCommits.push({
                value: this.props.value as string | undefined,
                selection: this.props.selection as Caret | undefined,
              });
            }
            return originalRender.call(this);
          });
          let shown = '';
          let caret = 0;
          let fieldCount = 0;
          let seenCount = 0;
          let lastNativeText = '';
          let lastNativeSelection: Caret | undefined;
          const inFlight: Array<{ text: string; count: number; caret: number }> = [];
          const sameCaret = (a: Caret, b: Caret | undefined) =>
            b !== undefined && a.start === b.start && (a.end ?? a.start) === (b.end ?? b.start);
          const requestedCarets: Caret[] = [];
          const syncCommit = (props: { value?: string; selection?: Caret }) => {
            if (props.selection) requestedCarets.push(props.selection);
            const value = props.value ?? '';
            const textChanged = value !== lastNativeText;
            const selectionChanged =
              props.selection !== undefined && !sameCaret(props.selection, lastNativeSelection);
            if (!textChanged && !selectionChanged) return;
            if (textChanged) lastNativeText = value;
            if (selectionChanged) lastNativeSelection = props.selection;
            if (seenCount !== fieldCount) return;
            if (value !== shown) {
              const fromEnd = shown.length - caret;
              shown = value;
              caret = Math.max(0, value.length - fromEnd);
            }
            if (props.selection) caret = Math.min(props.selection.start, shown.length);
          };
          const syncFromJs = () => {
            const commits = composerCommits;
            composerCommits = [];
            for (const commit of commits) syncCommit(commit);
          };
          const handlers = () => {
            const props = input().props as {
              onChangeText?: (text: string) => void;
              onSelectionChange?: (event: { nativeEvent: { selection: Caret } }) => void;
            };
            return { onChangeText: props.onChangeText, onSelectionChange: props.onSelectionChange };
          };
          const reachJs = (
            events: Array<{ text: string; count: number; caret: number }>,
            press?: () => void,
            pressFirst = false,
          ) => {
            const { onChangeText, onSelectionChange } = handlers();
            act(() => {
              if (press && pressFirst) press();
              for (const event of events) {
                onChangeText?.(event.text);
                onSelectionChange?.({
                  nativeEvent: { selection: { start: event.caret, end: event.caret } },
                });
              }
              if (press && !pressFirst) press();
            });
            const last = events.at(-1);
            if (last) {
              seenCount = last.count;
              lastNativeText = last.text;
              lastNativeSelection = { start: last.caret, end: last.caret };
            }
            syncFromJs();
          };
          const change = (text: string, nextCaret: number) => {
            shown = text;
            caret = nextCaret;
            fieldCount += 1;
            inFlight.push({ text: shown, count: fieldCount, caret });
          };
          return {
            get shown() {
              return shown;
            },
            get caret() {
              return caret;
            },
            get requestedCarets() {
              return requestedCarets;
            },
            type(chars: string) {
              for (const char of chars) {
                change(shown.slice(0, caret) + char + shown.slice(caret), caret + 1);
              }
            },
            correctLastWord(word: string) {
              const corrected = shown.replace(/\S+$/, word);
              change(corrected, corrected.length);
            },
            moveCaret(to: number) {
              caret = to;
              const { onSelectionChange } = handlers();
              act(() => {
                onSelectionChange?.({ nativeEvent: { selection: { start: to, end: to } } });
              });
              lastNativeSelection = { start: to, end: to };
              syncFromJs();
            },
            deliver(count = inFlight.length) {
              for (let index = 0; index < count && inFlight.length > 0; index += 1) {
                reachJs([inFlight.shift()!]);
              }
            },
            deliverTogether(tap: Host, order: 'tap-first' | 'tap-last') {
              reachJs(inFlight.splice(0), pressHandlerOf(tap), order === 'tap-first');
            },
            syncFromJs,
          };
        }

        const notes: Attachment = {
          id: 'notes',
          uri: 'file:///notes.txt',
          mimeType: 'text/plain',
          fileName: 'notes.txt',
          fileSize: 12,
        };

        it('sends every character the field held at the tap, with the attachment, and keeps what follows as the next draft', async () => {
          rememberDrafts();
          const send = pendingSend();
          const attachRef = React.createRef<ChatInputHandle>();
          const view = renderInput({
            onSend: send.onSend,
            attachRef,
            draftKey: 'conversation-1',
            conversationId: 'conversation-1',
            draftProvenance: local,
          });
          await act(async () => {
            attachRef.current?.addAttachments([notes]);
          });
          const field = busyPhoneField(view);
          field.type('In two lines explain the HTML div tag an');
          field.deliver();

          field.type('d the do');
          field.deliverTogether(view.getByTestId('send-button'), 'tap-last');
          const atTap = 'In two lines explain the HTML div tag and the do';

          expect(send.onSend).toHaveBeenCalledTimes(1);
          expect(send.onSend).toHaveBeenCalledWith(atTap, [
            expect.objectContaining({ id: 'notes' }),
          ]);
          expect(field.shown).toBe('');
          const writesAfterSend = mockSetDraft.mock.calls.length;

          field.type('ctype declaration');
          field.deliver();
          await act(async () => {
            send.resolve(true);
          });
          field.syncFromJs();

          expect(field.shown).toBe('ctype declaration');
          expect(field.caret).toBe('ctype declaration'.length);
          expect(view.getByLabelText('Message input').props.value).toBe('ctype declaration');
          expect(capturedAttachmentPreviewProps?.attachments).toEqual([]);
          const laterWrites = draftWritesFor('conversation-1', writesAfterSend);
          expect(laterWrites.some((text) => text.includes(atTap))).toBe(false);
          expect(laterWrites.at(-1)).toBe('ctype declaration');
        });

        it('keeps only the words typed after the tap when they reach JS in the same batch as the tap', async () => {
          rememberDrafts();
          const send = pendingSend();
          const view = renderInput({
            onSend: send.onSend,
            draftKey: 'conversation-1',
            conversationId: 'conversation-1',
            draftProvenance: local,
          });
          const field = busyPhoneField(view);
          field.type(sent);
          field.deliver();
          const writesBeforeSend = mockSetDraft.mock.calls.length;

          field.type('three more');
          field.deliverTogether(view.getByTestId('send-button'), 'tap-first');

          expect(send.onSend).toHaveBeenCalledWith(sent, undefined);
          expect(field.shown).toBe('three more');
          expect(field.caret).toBe('three more'.length);
          expect(field.requestedCarets.at(-1)).toEqual({
            start: 'three more'.length,
            end: 'three more'.length,
          });
          expect(view.getByLabelText('Message input').props.selection).toBeUndefined();

          await act(async () => {
            send.resolve(true);
          });
          field.syncFromJs();
          const requestsBeforeTyping = field.requestedCarets.length;
          field.type(' words');
          field.deliver();

          expect(field.requestedCarets).toHaveLength(requestsBeforeTyping);
          expect(field.shown).toBe('three more words');
          expect(field.caret).toBe('three more words'.length);
          expect(view.getByLabelText('Message input').props.value).toBe('three more words');
          expect(view.getByLabelText('Message input').props.selection).toBeUndefined();
          const laterWrites = draftWritesFor('conversation-1', writesBeforeSend);
          expect(laterWrites.some((text) => text.includes(sent))).toBe(false);
          expect(laterWrites.at(-1)).toBe('three more words');
        });

        it('asks for the caret only with the write that takes the sent words out, so a caret the person moves stays put', async () => {
          rememberDrafts();
          const send = pendingSend();
          const view = renderInput({
            onSend: send.onSend,
            draftKey: 'conversation-1',
            conversationId: 'conversation-1',
            draftProvenance: local,
          });
          const field = busyPhoneField(view);
          field.type(sent);
          field.deliver();

          field.type(' other');
          field.deliverTogether(view.getByTestId('send-button'), 'tap-first');
          expect(field.shown).toBe('other');
          expect(field.caret).toBe('other'.length);

          const requestsAfterSend = field.requestedCarets.length;
          expect(requestsAfterSend).toBeGreaterThan(0);
          field.moveCaret(0);
          expect(view.getByLabelText('Message input').props.selection).toBeUndefined();
          field.type('the ');
          field.deliver();
          await act(async () => {
            send.resolve(true);
          });
          field.syncFromJs();

          expect(field.requestedCarets).toHaveLength(requestsAfterSend);
          expect(field.shown).toBe('the other');
          expect(field.caret).toBe('the '.length);
          expect(view.getByLabelText('Message input').props.value).toBe('the other');
        });

        it('sends the words a refused send put back when Send or Retry is pressed again in the same draw', async () => {
          const onSend = jest
            .fn()
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);
          const attachRef = React.createRef<ChatInputHandle>();
          const view = renderInput({ onSend, attachRef });
          await act(async () => {
            attachRef.current?.addAttachments([notes]);
          });
          const field = busyPhoneField(view);
          field.type(sent);
          field.deliver();

          await act(async () => {
            pressHandlerOf(view.getByTestId('send-button'))();
          });
          field.syncFromJs();
          expect(field.shown).toBe(sent);
          expect(view.getByLabelText('Message input').props.value).toBe(sent);

          await act(async () => {
            pressHandlerOf(view.getByTestId('send-button'))();
          });
          field.syncFromJs();
          expect(field.shown).toBe(sent);

          await act(async () => {
            attachRef.current?.retrySend?.();
          });
          field.syncFromJs();

          expect(onSend).toHaveBeenCalledTimes(3);
          for (const call of onSend.mock.calls) {
            expect(call).toEqual([sent, [expect.objectContaining({ id: 'notes' })]]);
          }
          expect(field.shown).toBe('');
        });

        it('keeps the queued follow-up exact and only the later words in the field when the Queue tap and typing arrive together', async () => {
          rememberDrafts();
          const onSend = jest.fn(async () => true);
          const attachRef = React.createRef<ChatInputHandle>();
          const props = {
            onSend,
            attachRef,
            draftKey: 'conversation-1',
            conversationId: 'conversation-1',
            draftProvenance: local,
          };
          const view = renderInput({ ...props, isStreaming: true });
          await act(async () => {
            attachRef.current?.addAttachments([notes]);
          });
          const field = busyPhoneField(view);
          field.type(sent);
          field.deliver();
          const writesBeforeQueue = mockSetDraft.mock.calls.length;

          field.type('three more words');
          field.deliverTogether(view.getByLabelText('Queue message'), 'tap-first');

          expect(field.shown).toBe('three more words');
          expect(field.caret).toBe('three more words'.length);
          expect(
            draftWritesFor('conversation-1', writesBeforeQueue).some((text) =>
              text.includes(`${sent}three`),
            ),
          ).toBe(false);

          await act(async () => {
            view.rerender(<ChatInput {...defaultProps} {...props} isStreaming={false} />);
          });

          expect(onSend).toHaveBeenCalledTimes(1);
          expect(onSend).toHaveBeenCalledWith(sent, [expect.objectContaining({ id: 'notes' })]);
          expect(mockSetDraft.mock.calls.at(-1)?.[1]).toBe('three more words');
        });

        it('sends the words as they were at the tap when iOS commits a correction to the last one in the same batch', async () => {
          rememberDrafts();
          const send = pendingSend();
          const view = renderInput({
            onSend: send.onSend,
            draftKey: 'conversation-1',
            conversationId: 'conversation-1',
            draftProvenance: local,
          });
          const field = busyPhoneField(view);
          field.type('Tell me about the lighthose');
          field.deliver();
          const writesBeforeSend = mockSetDraft.mock.calls.length;

          field.correctLastWord('lighthouse');
          field.type(' also');
          field.deliverTogether(view.getByTestId('send-button'), 'tap-first');
          await act(async () => {
            send.resolve(true);
          });
          field.syncFromJs();

          expect(send.onSend).toHaveBeenCalledWith('Tell me about the lighthose', undefined);
          expect(field.shown).toBe('also');
          expect(field.caret).toBe('also'.length);
          expect(
            draftWritesFor('conversation-1', writesBeforeSend).some((text) =>
              text.includes('Tell me about the'),
            ),
          ).toBe(false);
        });

        it('hands only the words typed after the tap to the chat a new chat send opened, once and without the sent words', async () => {
          rememberDrafts();
          let resolve!: (outcome: { openedConversationId: string }) => void;
          const onSend = jest.fn(
            () => new Promise<{ openedConversationId: string }>((accept) => (resolve = accept)),
          );
          const view = renderInput({ onSend, draftKey: 'new-chat', draftProvenance: local });
          const field = busyPhoneField(view);
          try {
            field.type('In two lines explain the HTML div tag an');
            field.deliver();
            field.type('d the do');
            const writesBeforeTap = mockSetDraft.mock.calls.length;
            field.deliverTogether(view.getByTestId('send-button'), 'tap-last');
            field.type('ctype');
            field.deliver();
            await act(async () => {
              resolve({ openedConversationId: 'conversation-9' });
            });
            field.syncFromJs();

            expect(onSend).toHaveBeenCalledWith(
              'In two lines explain the HTML div tag and the do',
              undefined,
            );
            expect(useComposerPrefillStore.getState().pending['conversation-9']).toBe('ctype');
            expect(field.shown).toBe('');
            expect(
              mockSetDraft.mock.calls
                .slice(writesBeforeTap)
                .some(
                  ([key, text]) =>
                    key === 'conversation-9' || String(text).includes('explain the HTML'),
                ),
            ).toBe(false);
          } finally {
            useComposerPrefillStore.setState({ pending: {} });
          }
        });
      });
    });

    it('keeps the draft when the send is rejected by a pre-flight gate', async () => {
      const onSend = jest.fn(() => Promise.resolve(false));
      const { getByLabelText, getByTestId } = renderInput({ onSend });

      const input = getByLabelText('Message input');
      fireEvent.changeText(input, 'Blocked message');
      await act(async () => {
        fireEvent.press(getByTestId('send-button'));
      });

      expect(getByLabelText('Message input').props.value).toBe('Blocked message');
    });

    it('keeps the draft when the send handler throws', async () => {
      const onSend = jest.fn(() => Promise.reject(new Error('network')));
      const { getByLabelText, getByTestId } = renderInput({ onSend });

      const input = getByLabelText('Message input');
      fireEvent.changeText(input, 'Still here');
      await act(async () => {
        fireEvent.press(getByTestId('send-button'));
      });

      expect(getByLabelText('Message input').props.value).toBe('Still here');
    });

    it('ignores a second send while the first is still awaiting acceptance', async () => {
      let resolveSend!: (accepted: boolean) => void;
      const onSend = jest.fn(() => new Promise<boolean>((resolve) => (resolveSend = resolve)));
      const { getByLabelText, getByTestId } = renderInput({ onSend });

      fireEvent.changeText(getByLabelText('Message input'), 'Once only');
      fireEvent.press(getByTestId('send-button'));
      fireEvent.changeText(getByLabelText('Message input'), 'And again');
      fireEvent.press(getByTestId('send-button'));

      expect(onSend).toHaveBeenCalledTimes(1);
      expect(getByLabelText('Message input').props.value).toBe('And again');

      await act(async () => {
        resolveSend(true);
      });
    });
  });

  describe('large paste conversion', () => {
    it('converts a >10k-char paste into a "Pasted text" attachment and keeps prior text', () => {
      const { getByLabelText } = renderInput();

      const input = getByLabelText('Message input');
      fireEvent.changeText(input, 'Review this:');

      const bigBlock = 'x'.repeat(12_000);
      fireEvent.changeText(input, `Review this:${bigBlock}`);

      expect(getByLabelText('Message input').props.value).toBe('Review this:');
      const pasted = capturedAttachmentPreviewProps?.attachments.find((a) => a.pastedText);
      expect(pasted).toBeTruthy();
      expect(pasted!.fileName).toBe(pastedTextFileName(1));
      expect(pasted!.pastedText).toBe(bigBlock);
    });

    it('shares the composer paste policy with the other surfaces', () => {
      const { getByLabelText } = renderInput();

      const input = getByLabelText('Message input');
      const first = 'a'.repeat(LARGE_PASTE_THRESHOLD);
      fireEvent.changeText(input, first);
      const second = 'b'.repeat(LARGE_PASTE_THRESHOLD);
      fireEvent.changeText(getByLabelText('Message input'), second);

      const pastedNames = (capturedAttachmentPreviewProps?.attachments ?? [])
        .filter((a) => a.pastedText)
        .map((a) => a.fileName);
      expect(pastedNames).toEqual([pastedTextFileName(1), pastedTextFileName(2)]);
    });

    it('removes the text a large paste replaced instead of restoring it', () => {
      const { getByLabelText } = renderInput();

      const input = getByLabelText('Message input');
      fireEvent.changeText(input, 'keep REPLACED tail');

      const bigBlock = 'x'.repeat(12_000);
      fireEvent.changeText(getByLabelText('Message input'), `keep ${bigBlock} tail`);

      expect(getByLabelText('Message input').props.value).toBe('keep  tail');
      const pasted = capturedAttachmentPreviewProps?.attachments.find((a) => a.pastedText);
      expect(pasted?.pastedText).toBe(bigBlock);
    });

    it('does not convert gradual typing under the paste threshold', () => {
      const { getByLabelText } = renderInput();

      const input = getByLabelText('Message input');
      fireEvent.changeText(input, 'normal message');

      expect(getByLabelText('Message input').props.value).toBe('normal message');
      expect(capturedAttachmentPreviewProps?.attachments ?? []).toHaveLength(0);
    });

    it('folds pasted text back into the outgoing message on send', async () => {
      const onSend = jest.fn();
      const { getByLabelText, getByTestId } = renderInput({ onSend });

      const input = getByLabelText('Message input');
      const bigBlock = 'y'.repeat(11_000);
      fireEvent.changeText(input, bigBlock);
      fireEvent.changeText(getByLabelText('Message input'), 'summarize this');
      await act(async () => {
        fireEvent.press(getByTestId('send-button'));
      });

      expect(onSend).toHaveBeenCalledTimes(1);
      const [sentText, sentAttachments] = onSend.mock.calls[0];
      expect(sentText).toBe(`${bigBlock}\n\nsummarize this`);
      expect(sentAttachments).toBeUndefined();
    });

    describe('above the per-message cap', () => {
      const overCap = 'p'.repeat(MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH + 50_000);

      async function pasteAndSend(
        pasted: string,
        typed: string,
        props: Partial<React.ComponentProps<typeof ChatInput>> = {},
      ) {
        const view = renderInput(props);
        fireEvent.changeText(view.getByLabelText('Message input'), pasted);
        fireEvent.changeText(view.getByLabelText('Message input'), typed);
        await act(async () => {
          fireEvent.press(view.getByTestId('send-button'));
        });
        return view;
      }

      beforeEach(() => {
        mockAppMode = 'cloud';
        mockIsClerkSignedIn = true;
      });

      it('sends a paste over the cap as a Pasted text file and keeps the typed words inline', async () => {
        const onSend = jest.fn(async () => true);
        await pasteAndSend(overCap, 'summarize this', { onSend });

        expect(onSend).toHaveBeenCalledTimes(1);
        const [sentText, sentAttachments] = onSend.mock.calls[0] as unknown as [
          string,
          Array<{ uri: string; mimeType: string; fileName: string; fileSize: number }>,
        ];
        expect(sentText).toBe('summarize this');
        expect(sentAttachments).toHaveLength(1);
        expect(sentAttachments[0]).toMatchObject({
          mimeType: 'text/plain',
          fileName: pastedTextFileName(1),
          fileSize: overCap.length,
        });
        expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
          sentAttachments[0]!.uri,
          overCap,
          expect.objectContaining({ encoding: 'utf8' }),
        );
      });

      it('removes the cached file once the send settles', async () => {
        const onSend = jest.fn(async () => true);
        await pasteAndSend(overCap, 'summarize this', { onSend });

        const [, sentAttachments] = onSend.mock.calls[0] as unknown as [
          string,
          Array<{ uri: string }>,
        ];
        await waitFor(() =>
          expect(mockDeleteAsync).toHaveBeenCalledWith(sentAttachments[0]!.uri, {
            idempotent: true,
          }),
        );
      });

      it('keeps a paste under the cap inline in the message', async () => {
        const onSend = jest.fn(async () => true);
        const block = 'q'.repeat(MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH - 100);
        await pasteAndSend(block, 'summarize this', { onSend });

        const [sentText, sentAttachments] = onSend.mock.calls[0] as unknown as [string, unknown];
        expect(sentText).toBe(`${block}\n\nsummarize this`);
        expect(sentAttachments).toBeUndefined();
        expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
      });

      it('attaches only as many pastes as the message needs', async () => {
        const onSend = jest.fn(async () => true);
        const view = renderInput({ onSend });
        const small = 's'.repeat(20_000);
        const large = 'l'.repeat(MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH);
        fireEvent.changeText(view.getByLabelText('Message input'), small);
        fireEvent.changeText(view.getByLabelText('Message input'), large);
        fireEvent.changeText(view.getByLabelText('Message input'), 'compare');
        await act(async () => {
          fireEvent.press(view.getByTestId('send-button'));
        });

        const [sentText, sentAttachments] = onSend.mock.calls[0] as unknown as [
          string,
          Array<{ fileName: string }>,
        ];
        expect(sentText).toBe(`${small}\n\ncompare`);
        expect(sentAttachments).toHaveLength(1);
        expect(sentAttachments[0]!.fileName).toBe(pastedTextFileName(2));
      });

      it('keeps an over-cap paste inline when the server announces a longer newest message', async () => {
        applyServerMessageLimits({ latest_message_max_chars: overCap.length + 1_000 });
        const onSend = jest.fn(async () => true);
        await pasteAndSend(overCap, 'summarize this', { onSend });

        const [sentText, sentAttachments] = onSend.mock.calls[0] as unknown as [string, unknown];
        expect(sentText).toBe(`${overCap}\n\nsummarize this`);
        expect(sentAttachments).toBeUndefined();
      });

      it.each([
        ['the announced limit is unreadable', { latest_message_max_chars: 'many' }],
        ['the announced limit is not positive', { latest_message_max_chars: 0 }],
      ])('keeps the old cap when %s', async (_case, wire) => {
        applyServerMessageLimits(wire);
        const onSend = jest.fn(async () => true);
        await pasteAndSend(overCap, 'summarize this', { onSend });

        const [sentText, sentAttachments] = onSend.mock.calls[0] as unknown as [string, unknown[]];
        expect(sentText).toBe('summarize this');
        expect(sentAttachments).toHaveLength(1);
      });

      it('keeps the old cap for a free-quota turn whatever the server announces', async () => {
        applyServerMessageLimits({ latest_message_max_chars: overCap.length + 1_000 });
        mockFreeQuotaModelIds = new Set([mockSelectedModel]);
        const onSend = jest.fn(async () => true);
        await pasteAndSend(overCap, 'summarize this', { onSend });

        const [sentText, sentAttachments] = onSend.mock.calls[0] as unknown as [string, unknown[]];
        expect(sentText).toBe('summarize this');
        expect(sentAttachments).toHaveLength(1);
      });

      it('keeps an over-cap paste inline in Local Mode, which has no message cap', async () => {
        mockAppMode = 'local';
        const onSend = jest.fn(async () => true);
        await pasteAndSend(overCap, 'summarize this', { onSend });

        const [sentText, sentAttachments] = onSend.mock.calls[0] as unknown as [string, unknown];
        expect(sentText).toBe(`${overCap}\n\nsummarize this`);
        expect(sentAttachments).toBeUndefined();
        expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
      });

      it('names the upload failure and keeps the paste when the file cannot go up', async () => {
        const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
        const onSend = jest.fn(async (_text: string, attachments?: Array<{ id: string }>) => {
          const { begin, settle } = useUploadLifecycleStore.getState();
          begin(attachments![0]!.id);
          settle(attachments![0]!.id, 'failed', 'Free accounts can upload 5 files a day.');
          return false;
        });
        const view = await pasteAndSend(overCap, 'summarize this', { onSend });

        expect(alertSpy).toHaveBeenCalledWith(
          'Pasted text not sent',
          'Free accounts can upload 5 files a day.',
        );
        expect(view.getByLabelText('Message input').props.value).toBe('summarize this');
        expect(capturedAttachmentPreviewProps?.attachments.some((a) => a.pastedText)).toBe(true);
        alertSpy.mockRestore();
      });

      async function withholdAfterTypingDuringWrite(onSend: jest.Mock) {
        let finishWrite: () => void = () => undefined;
        mockWriteAsStringAsync.mockImplementationOnce(
          () =>
            new Promise<undefined>((resolve) => {
              finishWrite = () => resolve(undefined);
            }),
        );
        const view = renderInput({ onSend });
        const input = view.getByLabelText('Message input');
        fireEvent.changeText(input, overCap);
        fireEvent.changeText(input, 'summarize this');
        await act(async () => {
          fireEvent.press(view.getByTestId('send-button'));
        });
        fireEvent.changeText(input, 'summarize this and list the risks');
        await act(async () => {
          finishWrite();
        });
        return view;
      }

      it('keeps words typed while the paste is being written and sends them on the next press', async () => {
        const onSend = jest.fn(async () => true);
        const view = await withholdAfterTypingDuringWrite(onSend);

        expect(onSend).not.toHaveBeenCalled();
        expect(view.getByLabelText('Message input').props.value).toBe(
          'summarize this and list the risks',
        );

        await act(async () => {
          fireEvent.press(view.getByTestId('send-button'));
        });

        expect(onSend).toHaveBeenCalledTimes(1);
        const [sentText, sentAttachments] = onSend.mock.calls[0] as unknown as [
          string,
          Array<{ fileName: string }>,
        ];
        expect(sentText).toBe('summarize this and list the risks');
        expect(sentAttachments).toHaveLength(1);
        expect(mockWriteAsStringAsync).toHaveBeenCalledTimes(1);
      });

      it('removes the cached file when the withheld paste is expanded back into the text', async () => {
        await withholdAfterTypingDuringWrite(jest.fn(async () => true));
        const writtenUri = mockWriteAsStringAsync.mock.calls[0]![0] as string;
        const chip = capturedAttachmentPreviewProps!.attachments.find((a) => a.pastedText)!;

        act(() => {
          capturedAttachmentPreviewProps!.onExpandPastedText!(chip.id);
        });

        expect(mockDeleteAsync).toHaveBeenCalledWith(writtenUri, { idempotent: true });
      });

      it('removes the cached file when the withheld paste chip is removed', async () => {
        await withholdAfterTypingDuringWrite(jest.fn(async () => true));
        const writtenUri = mockWriteAsStringAsync.mock.calls[0]![0] as string;
        const chip = capturedAttachmentPreviewProps!.attachments.find((a) => a.pastedText)!;

        act(() => {
          capturedAttachmentPreviewProps!.onRemove!(chip.id);
        });

        expect(mockDeleteAsync).toHaveBeenCalledWith(writtenUri, { idempotent: true });
      });

      describe('a pasted file that came back to the composer', () => {
        const returnedUri = 'file:///cache/pasted-text-returned.txt';

        async function renderWithReturnedFile(onSend: jest.Mock) {
          const attachRef = React.createRef<ChatInputHandle>();
          const view = renderInput({ attachRef, onSend });
          await act(async () => {
            attachRef.current?.addAttachments([
              {
                id: 'returned-file',
                uri: returnedUri,
                mimeType: 'text/plain',
                fileName: pastedTextFileName(1),
                fileSize: 1_000,
              },
            ]);
          });
          return view;
        }

        it('is removed from the cache when the person removes it', async () => {
          await renderWithReturnedFile(jest.fn(async () => true));

          act(() => {
            capturedAttachmentPreviewProps!.onRemove!('returned-file');
          });

          expect(mockDeleteAsync).toHaveBeenCalledWith(returnedUri, { idempotent: true });
        });

        it('is removed from the cache once it is sent', async () => {
          const onSend = jest.fn(async () => true);
          const view = await renderWithReturnedFile(onSend);
          fireEvent.changeText(view.getByLabelText('Message input'), 'summarize this');
          await act(async () => {
            fireEvent.press(view.getByTestId('send-button'));
          });

          expect(onSend).toHaveBeenCalledTimes(1);
          await waitFor(() =>
            expect(mockDeleteAsync).toHaveBeenCalledWith(returnedUri, { idempotent: true }),
          );
        });
      });

      it('does not send when the file cannot be written, and says so', async () => {
        const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
        mockWriteAsStringAsync.mockRejectedValueOnce(new Error('disk full'));
        const onSend = jest.fn(async () => true);
        const view = await pasteAndSend(overCap, 'summarize this', { onSend });

        expect(onSend).not.toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith(
          'Pasted text not attached',
          'Your message is still here. Try sending again.',
        );
        expect(view.getByLabelText('Message input').props.value).toBe('summarize this');
        alertSpy.mockRestore();
      });
    });

    it('expands the pasted text back into the composer on request', () => {
      const { getByLabelText } = renderInput();

      const input = getByLabelText('Message input');
      const bigBlock = 'z'.repeat(10_500);
      fireEvent.changeText(input, bigBlock);

      const pasted = capturedAttachmentPreviewProps?.attachments.find((a) => a.pastedText);
      expect(pasted).toBeTruthy();

      act(() => {
        capturedAttachmentPreviewProps!.onExpandPastedText!(pasted!.id);
      });

      expect(getByLabelText('Message input').props.value).toBe(bigBlock);
      expect(capturedAttachmentPreviewProps?.attachments ?? []).toHaveLength(0);
    });
  });

  describe('offline state', () => {
    it('shows offline placeholder when isOnline is false', () => {
      const { getByLabelText } = renderInput({ isOnline: false });

      const input = getByLabelText('Message input');
      expect(input.props.placeholder).toContain('Offline');
    });
  });

  describe('recording overlay controls', () => {
    it('asks the capture owner for its completed result even after native capture may have ended', () => {
      const { getByLabelText } = renderInput();
      act(() => capturedRecordingStart!());
      fireEvent.press(getByLabelText('Stop recording'));
      expect(mockVoiceStop).toHaveBeenCalledWith('insert');
    });

    it('delegates send intent without independently reading global transcription state', () => {
      const { getByLabelText } = renderInput();
      act(() => capturedRecordingStart!());
      fireEvent.press(getByLabelText('Send recording'));
      expect(mockVoiceStop).toHaveBeenCalledWith('send');
    });
  });

  describe('stacked layout stability', () => {
    function reportSingleLineHeight(input: ReturnType<typeof renderInput>['getByLabelText']) {
      measureOneLine();
      fireEvent(input('Message input'), 'contentSizeChange', {
        nativeEvent: { contentSize: { width: 306, height: 20 } },
      });
    }

    it('returns to the one-line layout when the stacked input remeasures as one line', () => {
      const { getByLabelText, queryByTestId } = renderInput();

      fireEvent.changeText(getByLabelText('Message input'), 'Create a video of an stylist anime');
      stackComposer(getByLabelText);
      expect(queryByTestId('chat.composer.expand')).not.toBeNull();

      reportSingleLineHeight(getByLabelText);

      expect(queryByTestId('chat.composer.expand')).toBeNull();
    });

    it('never gives the stacked input more width than the one-line input, so a remeasure cannot flip it back', () => {
      const { getByLabelText, getByTestId } = renderInput();
      const widthShape = () => {
        const input = getByLabelText('Message input');
        const style = StyleSheet.flatten(input.props.style);
        const card = StyleSheet.flatten(getByTestId('chat.composer.card').props.style);
        return {
          inputInset: Number(style.paddingLeft ?? 0) + Number(style.paddingRight ?? 0),
          card: { paddingLeft: card.paddingLeft, paddingRight: card.paddingRight },
        };
      };

      fireEvent.changeText(getByLabelText('Message input'), 'Create a video of an stylist anime');
      reportSingleLineHeight(getByLabelText);
      const oneLine = widthShape();
      stackComposer(getByLabelText);
      const stacked = widthShape();

      expect(stacked.card).toEqual(oneLine.card);
      expect(stacked.inputInset).toBeGreaterThanOrEqual(oneLine.inputInset);
    });

    it('drops the expand control once the composer is emptied', () => {
      const { getByLabelText, queryByTestId } = renderInput();

      fireEvent.changeText(getByLabelText('Message input'), 'Create a video of an stylist anime');
      stackComposer(getByLabelText);
      expect(queryByTestId('chat.composer.expand')).not.toBeNull();

      fireEvent.changeText(getByLabelText('Message input'), '');

      expect(queryByTestId('chat.composer.expand')).toBeNull();
    });
  });

  describe('line count at any system text size', () => {
    const startingScale = Dimensions.get('window').fontScale;
    const cappedScale = (scale: number) => Math.min(scale, HEADER_TEXT_SCALE_LIMIT);
    const lineHeightAt = (scale: number) => chatTypography.body.lineHeight * cappedScale(scale);

    function reportLines(
      input: ReturnType<typeof renderInput>['getByLabelText'],
      lines: number,
      scale: number,
    ) {
      measureOneLine(lineHeightAt(scale));
      fireEvent(input('Message input'), 'contentSizeChange', {
        nativeEvent: { contentSize: { width: 280, height: lineHeightAt(scale) * lines } },
      });
    }

    function lastReported(onMultilineChange: jest.Mock) {
      return onMultilineChange.mock.calls[onMultilineChange.mock.calls.length - 1]?.[0];
    }

    afterEach(() => {
      setTextScale(startingScale);
    });

    it('keeps an empty composer on one line at the default size', () => {
      setTextScale(1);
      const onMultilineChange = jest.fn();
      const { getByLabelText, queryByTestId } = renderInput({ onMultilineChange });

      reportLines(getByLabelText, 1, 1);

      expect(queryByTestId('chat.composer.expand')).toBeNull();
      expect(lastReported(onMultilineChange)).toBe(false);
    });

    it('keeps an empty composer on one line at the largest size even when the placeholder wraps', () => {
      setTextScale(LARGEST_IOS_TEXT_SCALE);
      const onMultilineChange = jest.fn();
      const { getByLabelText, queryByTestId } = renderInput({ onMultilineChange });

      reportLines(getByLabelText, 2, LARGEST_IOS_TEXT_SCALE);

      expect(queryByTestId('chat.composer.expand')).toBeNull();
      expect(lastReported(onMultilineChange)).toBe(false);
    });

    it('treats one line of text at the largest size as one line', () => {
      setTextScale(LARGEST_IOS_TEXT_SCALE);
      const onMultilineChange = jest.fn();
      const { getByLabelText, queryByTestId } = renderInput({ onMultilineChange });

      fireEvent.changeText(getByLabelText('Message input'), 'Hello');
      reportLines(getByLabelText, 1, LARGEST_IOS_TEXT_SCALE);

      expect(queryByTestId('chat.composer.expand')).toBeNull();
      expect(lastReported(onMultilineChange)).toBe(false);
    });

    it.each([1, LARGEST_IOS_TEXT_SCALE])('stacks two lines of text at scale %s', (scale) => {
      setTextScale(scale);
      const onMultilineChange = jest.fn();
      const { getByLabelText, queryByTestId } = renderInput({ onMultilineChange });

      fireEvent.changeText(getByLabelText('Message input'), 'Create a video of an stylist anime');
      reportLines(getByLabelText, 2, scale);

      expect(queryByTestId('chat.composer.expand')).not.toBeNull();
      expect(lastReported(onMultilineChange)).toBe(true);
    });

    it('stacks two lines when the platform grows line height more slowly than the text scale', () => {
      setTextScale(HEADER_TEXT_SCALE_LIMIT);
      const { getByLabelText, queryByTestId } = renderInput();
      const nonLinearLine = Math.round(chatTypography.body.lineHeight * 1.4);

      fireEvent.changeText(getByLabelText('Message input'), 'Create a video of an stylist anime');
      measureOneLine(nonLinearLine);
      fireEvent(getByLabelText('Message input'), 'contentSizeChange', {
        nativeEvent: { contentSize: { width: 280, height: nonLinearLine * 2 } },
      });

      expect(queryByTestId('chat.composer.expand')).not.toBeNull();
    });

    it('stays on one line when the text size changes with the composer empty', () => {
      setTextScale(1);
      const onMultilineChange = jest.fn();
      const { getByLabelText, queryByTestId } = renderInput({ onMultilineChange });
      reportLines(getByLabelText, 1, 1);

      setTextScale(LARGEST_IOS_TEXT_SCALE);
      reportLines(getByLabelText, 2, LARGEST_IOS_TEXT_SCALE);
      expect(queryByTestId('chat.composer.expand')).toBeNull();
      expect(lastReported(onMultilineChange)).toBe(false);

      setTextScale(1);
      reportLines(getByLabelText, 1, 1);
      expect(queryByTestId('chat.composer.expand')).toBeNull();
      expect(lastReported(onMultilineChange)).toBe(false);

      fireEvent.changeText(getByLabelText('Message input'), 'H');
      reportLines(getByLabelText, 1, 1);
      expect(queryByTestId('chat.composer.expand')).toBeNull();
      expect(lastReported(onMultilineChange)).toBe(false);
    });

    it('stacks two lines that arrive at once when they match the wrapped placeholder height', () => {
      setTextScale(LARGEST_IOS_TEXT_SCALE);
      const onMultilineChange = jest.fn();
      const { getByLabelText, queryByTestId } = renderInput({ onMultilineChange });
      reportLines(getByLabelText, 2, LARGEST_IOS_TEXT_SCALE);
      expect(lastReported(onMultilineChange)).toBe(false);

      fireEvent.changeText(getByLabelText('Message input'), 'Create a video of an stylist anime');

      expect(queryByTestId('chat.composer.expand')).not.toBeNull();
      expect(lastReported(onMultilineChange)).toBe(true);
    });

    it('returns a one-line message to one line when the text size grows', () => {
      setTextScale(1);
      const { getByLabelText, queryByTestId } = renderInput();
      fireEvent.changeText(getByLabelText('Message input'), 'Hello');
      reportLines(getByLabelText, 1, 1);

      setTextScale(LARGEST_IOS_TEXT_SCALE);
      reportLines(getByLabelText, 1, LARGEST_IOS_TEXT_SCALE);

      expect(queryByTestId('chat.composer.expand')).toBeNull();
    });

    it('shrinks the placeholder with the header cap so two of its lines fit the input', () => {
      setTextScale(LARGEST_IOS_TEXT_SCALE);
      const { getByLabelText, getByTestId, queryByTestId } = renderInput();
      const input = getByLabelText('Message input');
      const style = StyleSheet.flatten(input.props.style);

      expect(input.props.placeholder).toBe("What's on your mind?");
      expect(input.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
      const probe = getByTestId('chat.composer.line-probe', { includeHiddenElements: true });
      expect(queryByTestId('chat.composer.line-probe')).toBeNull();
      const probeStyle = StyleSheet.flatten(probe.props.style);
      expect(probe.props.maxFontSizeMultiplier).toBe(input.props.maxFontSizeMultiplier);
      expect(probe.props.numberOfLines).toBe(1);
      expect(probeStyle.fontSize).toBe(style.fontSize);
      expect(probeStyle.lineHeight).toBe(style.lineHeight);
      expect(lineHeightAt(LARGEST_IOS_TEXT_SCALE) * 2).toBeLessThanOrEqual(Number(style.maxHeight));
    });
  });

  describe('expand to full-screen editor', () => {
    const LONG_PASTE = 'a'.repeat(800);

    it('offers no expand control while the text fits on one line', () => {
      const { queryByTestId } = renderInput();
      expect(queryByTestId('chat.composer.expand')).toBeNull();
    });

    it('reveals the expand control once a long paste wraps', () => {
      const { getByLabelText, queryByTestId } = renderInput();

      fireEvent.changeText(getByLabelText('Message input'), LONG_PASTE);
      expect(getByLabelText('Message input').props.value).toBe(LONG_PASTE);
      expect(queryByTestId('chat.composer.expand')).toBeNull();

      stackComposer(getByLabelText);

      expect(queryByTestId('chat.composer.expand')).not.toBeNull();
    });

    it('round-trips the message through the modal and back into the composer', () => {
      const { getByLabelText, getByTestId, queryByTestId } = renderInput();

      fireEvent.changeText(getByLabelText('Message input'), LONG_PASTE);
      stackComposer(getByLabelText);
      fireEvent.press(getByTestId('chat.composer.expand'));

      const expanded = getByTestId('chat.composer.fullscreen.input');
      expect(expanded.props.value).toBe(LONG_PASTE);

      fireEvent.changeText(expanded, `${LONG_PASTE} edited`);
      expect(getByTestId('chat.composer.fullscreen.input').props.value).toBe(
        `${LONG_PASTE} edited`,
      );

      fireEvent.press(getByTestId('chat.composer.fullscreen.back'));

      expect(queryByTestId('chat.composer.fullscreen.input')).toBeNull();
      expect(getByLabelText('Message input').props.value).toBe(`${LONG_PASTE} edited`);
    });

    it('keeps the draft in the composer when the screen loses focus under the open editor', () => {
      const listeners: Record<string, () => void> = {};
      const navigation = {
        isFocused: jest.fn(() => true),
        addListener: jest.fn((event: string, listener: () => void) => {
          listeners[event] = listener;
          return () => delete listeners[event];
        }),
      };
      const { getByLabelText, getByTestId, queryByTestId } = render(
        <NavigationContext.Provider value={navigation as never}>
          <ChatInput {...defaultProps} />
        </NavigationContext.Provider>,
      );

      fireEvent.changeText(getByLabelText('Message input'), LONG_PASTE);
      stackComposer(getByLabelText);
      fireEvent.press(getByTestId('chat.composer.expand'));
      fireEvent.changeText(getByTestId('chat.composer.fullscreen.input'), `${LONG_PASTE} edited`);

      act(() => listeners.blur?.());

      expect(queryByTestId('chat.composer.fullscreen.input')).toBeNull();
      expect(getByLabelText('Message input').props.value).toBe(`${LONG_PASTE} edited`);
    });

    it('sends from the expanded editor and closes it', async () => {
      const onSend = jest.fn();
      const { getByLabelText, getByTestId, queryByTestId } = renderInput({ onSend });

      fireEvent.changeText(getByLabelText('Message input'), LONG_PASTE);
      stackComposer(getByLabelText);
      fireEvent.press(getByTestId('chat.composer.expand'));

      const expandedSend = within(getByTestId('chat.composer.fullscreen.send')).getByTestId(
        'send-button',
      );
      await act(async () => {
        fireEvent.press(expandedSend);
      });

      expect(onSend).toHaveBeenCalledWith(LONG_PASTE, undefined);
      expect(queryByTestId('chat.composer.fullscreen.input')).toBeNull();
      expect(getByLabelText('Message input').props.value).toBe('');
    });

    it('matches the composer snapshot in both layouts', () => {
      const resting = renderInput();
      expect(resting.toJSON()).toMatchSnapshot('resting');
      resting.unmount();

      const wrapped = renderInput();
      fireEvent.changeText(wrapped.getByLabelText('Message input'), LONG_PASTE);
      stackComposer(wrapped.getByLabelText);
      expect(wrapped.toJSON()).toMatchSnapshot('wrapped');
    });
  });

  describe('model label', () => {
    it('renders the display name on the control row and opens the picker', () => {
      const onOpenModelPicker = jest.fn();
      const { getByTestId, queryByText } = renderInput({ onOpenModelPicker });

      const label = getByTestId('chat.composer.model');
      expect(within(label).getByText('Fixture Model')).toBeTruthy();
      expect(queryByText('fixture-cloud-model')).toBeNull();
      expect(label.props.accessibilityLabel).toContain('Model: Fixture Model');

      fireEvent.press(label);
      expect(onOpenModelPicker).toHaveBeenCalledTimes(1);
    });

    it('renders no label when the host offers no way to change the model', () => {
      const { queryByTestId } = renderInput({ onOpenModelPicker: undefined });

      expect(queryByTestId('chat.composer.model')).toBeNull();
    });
  });

  describe('composer handle', () => {
    it('restores returned text into an empty composer and after an existing draft', () => {
      const ref = React.createRef<ChatInputHandle>();
      const screen = renderInput({ attachRef: ref });

      act(() => ref.current?.restoreText?.('Also cover Q3'));
      expect(screen.getByLabelText('Message input').props.value).toBe('Also cover Q3');

      fireEvent.changeText(screen.getByLabelText('Message input'), 'My existing draft');
      act(() => ref.current?.restoreText?.('Also cover Q3'));
      expect(screen.getByLabelText('Message input').props.value).toBe(
        'My existing draft\n\nAlso cover Q3',
      );
    });

    it('adds shared text after a parked draft instead of replacing it', () => {
      mockGetDraft.mockImplementation(() => 'My parked draft');
      const ref = React.createRef<ChatInputHandle>();
      const screen = renderInput({
        attachRef: ref,
        draftKey: 'new-chat',
        draftProvenance: { scope: 'local' },
      });

      adoptComposerHandoff('new-chat', null);
      stageComposerText('new-chat', 'Shared article text');
      stageComposerText('new-chat', 'Shared article text');
      act(() => adoptComposerHandoff('new-chat', ref.current));

      expect(screen.getByLabelText('Message input').props.value).toBe(
        'My parked draft\n\nShared article text',
      );
      expect(mockSetDraft).toHaveBeenLastCalledWith(
        'new-chat',
        'My parked draft\n\nShared article text',
        { scope: 'local' },
      );
      expect(takeComposerText('new-chat')).toBe('');
      mockGetDraft.mockImplementation(() => '');
    });

    it('leaves shared text staged until a composer can receive it', () => {
      stageComposerText('conversation-9', 'Shared before mount');
      adoptComposerHandoff('conversation-9', null);

      expect(takeComposerText('conversation-9')).toBe('Shared before mount');
    });

    it('exposes focus() and drives the real text field with it', () => {
      const focusSpy = jest.spyOn(TextInput.prototype, 'focus');
      const ref = React.createRef<ChatInputHandle>();

      try {
        renderInput({ attachRef: ref });

        expect(typeof ref.current?.focus).toBe('function');
        expect(focusSpy).not.toHaveBeenCalled();

        act(() => {
          ref.current!.focus!();
        });

        expect(focusSpy).toHaveBeenCalledTimes(1);
      } finally {
        focusSpy.mockRestore();
      }
    });

    it('still forwards attachments through the same handle', () => {
      const ref = React.createRef<ChatInputHandle>();
      renderInput({ attachRef: ref });

      act(() => {
        ref.current!.addAttachments([
          {
            id: 'a1',
            uri: 'file:///tmp/a.png',
            mimeType: 'image/png',
            fileName: 'a.png',
            fileSize: 128,
          },
        ]);
      });

      expect(capturedAttachmentPreviewProps?.attachments).toHaveLength(1);
    });

    it('shows attachments inside the composer card, above the text', () => {
      const ref = React.createRef<ChatInputHandle>();
      const { getByTestId } = renderInput({ attachRef: ref });

      act(() => {
        ref.current!.addAttachments([
          {
            id: 'a1',
            uri: 'file:///tmp/a.png',
            mimeType: 'image/png',
            fileName: 'a.png',
            fileSize: 128,
          },
        ]);
      });

      const card = getByTestId('chat.composer.card');
      expect(within(card).getByTestId('attachment-preview')).toBeTruthy();
      expect(within(card).getByTestId('chat.composer.input')).toBeTruthy();
    });
  });
  describe('keyboard gate', () => {
    function openKeyboard() {
      const add = Keyboard.addListener as unknown as jest.Mock;
      act(() => {
        for (const call of add.mock.calls) {
          if (call[0] === 'keyboardWillShow' || call[0] === 'keyboardDidShow') {
            (call[1] as () => void)();
          }
        }
      });
    }

    function closeKeyboard() {
      const add = Keyboard.addListener as unknown as jest.Mock;
      act(() => {
        for (const call of add.mock.calls) {
          if (call[0] === 'keyboardWillHide' || call[0] === 'keyboardDidHide') {
            (call[1] as () => void)();
          }
        }
      });
    }

    beforeEach(() => {
      jest
        .spyOn(Keyboard, 'addListener')
        .mockImplementation(() => ({ remove: jest.fn() }) as never);
    });

    it('drops the safe-area padding while the keyboard is up and restores it on close', () => {
      const screen = renderInput();
      const paddingOf = () =>
        (screen.getByTestId('chat.composer').props.style as { paddingBottom?: number })
          .paddingBottom;

      const resting = paddingOf();
      openKeyboard();
      expect(paddingOf()).toBe(8);
      closeKeyboard();
      expect(paddingOf()).toBe(resting);
    });

    it('keeps the send, attachment and model controls reachable with the keyboard up', () => {
      const screen = renderInput({ onOpenAddToChat: jest.fn(), onOpenModelPicker: jest.fn() });
      fireEvent.changeText(screen.getByLabelText('Message input'), 'hello');
      openKeyboard();

      stackComposer(screen.getByLabelText);
      expect(screen.getAllByLabelText('Add to chat').length).toBeGreaterThan(0);
      expect(screen.getByTestId('send-button')).toBeTruthy();
      expect(screen.getByTestId('chat.composer.model')).toBeTruthy();
    });

    it('keeps a multiline composer stacked while the keyboard is up', () => {
      const screen = renderInput();
      fireEvent.changeText(screen.getByLabelText('Message input'), 'line one\nline two');
      stackComposer(screen.getByLabelText);
      openKeyboard();

      expect(screen.getByLabelText('Message input').props.multiline).toBe(true);
      expect(screen.getByTestId('chat.composer.expand')).toBeTruthy();
    });

    it('dismisses the keyboard before the model sheet opens over the composer', () => {
      const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
      const onOpenModelPicker = jest.fn();
      const screen = renderInput({ onOpenModelPicker });
      openKeyboard();

      fireEvent.press(screen.getByTestId('chat.composer.model'));

      expect(onOpenModelPicker).toHaveBeenCalled();
      dismiss.mockRestore();
    });
  });

  describe('wide windows', () => {
    it('caps the composer at the reading column instead of spanning a tablet', () => {
      const screen = renderInput();
      const style = screen.getByTestId('chat.composer').props.style as {
        width?: number | string;
        maxWidth?: number;
        alignSelf?: string;
      };

      expect(style.maxWidth).toBe(READING_COLUMN_MAX_WIDTH);
      expect(style.alignSelf).toBe('center');
      expect(style.width).toBe('100%');
    });
  });
  describe('a send made while a file is still going up', () => {
    const uploading = () => useUploadLifecycleStore.getState();

    afterEach(() => {
      act(() => {
        uploading().reset();
      });
    });

    async function attachOne(attachRef: React.RefObject<ChatInputHandle | null>) {
      await act(async () => {
        attachRef.current?.addAttachments([
          {
            id: 'up-1',
            uri: 'file:///doc.pdf',
            mimeType: 'application/pdf',
            fileName: 'doc.pdf',
            fileSize: 1024,
          },
        ]);
      });
    }

    it('waits for the upload rather than sending the message without it', async () => {
      const onSend = jest.fn().mockResolvedValue(undefined);
      const attachRef = React.createRef<ChatInputHandle>();
      const { getByLabelText, getByTestId } = renderInput({ onSend, attachRef });

      await attachOne(attachRef);
      act(() => {
        uploading().begin('up-1');
      });
      fireEvent.changeText(getByLabelText('Message input'), 'read this');
      await act(async () => {
        fireEvent.press(getByTestId('send-button'));
      });

      expect(onSend).not.toHaveBeenCalled();
      expect(getByLabelText('Sending when the upload finishes')).toBeTruthy();

      await act(async () => {
        uploading().settle('up-1', 'done');
      });

      await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
      expect(onSend.mock.calls[0][0]).toBe('read this');
      expect((onSend.mock.calls[0][1] as unknown[]) ?? []).toHaveLength(1);
    });

    it('drops a held Cloud send when the composer switches to Local', async () => {
      const onSend = jest.fn().mockResolvedValue(undefined);
      const attachRef = React.createRef<ChatInputHandle>();
      const cloudProps = {
        onSend,
        attachRef,
        draftKey: 'new-chat',
        draftProvenance: { scope: 'cloud' as const, ownerId: 'account-a' },
      };
      const { getByLabelText, getByTestId, queryByLabelText, rerender } = renderInput(cloudProps);

      await attachOne(attachRef);
      act(() => {
        uploading().begin('up-1');
      });
      fireEvent.changeText(getByLabelText('Message input'), 'cloud only');
      await act(async () => {
        fireEvent.press(getByTestId('send-button'));
      });
      expect(getByLabelText('Sending when the upload finishes')).toBeTruthy();

      await act(async () => {
        rerender(
          <ChatInput
            {...defaultProps}
            onSend={onSend}
            attachRef={attachRef}
            draftKey="new-chat"
            draftProvenance={{ scope: 'local' }}
          />,
        );
      });
      expect(queryByLabelText('Sending when the upload finishes')).toBeNull();

      await act(async () => {
        uploading().settle('up-1', 'done');
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(onSend).not.toHaveBeenCalled();
    });

    it('keeps the message in the composer when the upload ends any other way', async () => {
      const onSend = jest.fn().mockResolvedValue(undefined);
      const attachRef = React.createRef<ChatInputHandle>();
      const { getByLabelText, getByTestId } = renderInput({ onSend, attachRef });

      await attachOne(attachRef);
      act(() => {
        uploading().begin('up-1');
      });
      fireEvent.changeText(getByLabelText('Message input'), 'read this');
      await act(async () => {
        fireEvent.press(getByTestId('send-button'));
      });

      await act(async () => {
        uploading().settle('up-1', 'failed', 'network');
      });

      expect(onSend).not.toHaveBeenCalled();
      expect(getByLabelText('Message input').props.value).toBe('read this');
    });

    it('does not call a message queued before the reader has pressed send', async () => {
      const attachRef = React.createRef<ChatInputHandle>();
      const { getByLabelText, queryByLabelText } = renderInput({ attachRef });

      await attachOne(attachRef);
      act(() => {
        uploading().begin('up-1');
      });
      fireEvent.changeText(getByLabelText('Message input'), 'still writing');

      expect(queryByLabelText('Sending when the upload finishes')).toBeNull();
      expect(queryByLabelText('Queued')).toBeNull();
      expect(getByLabelText('Send message')).toBeTruthy();
    });

    it('takes the message back when the reader edits it while it waits', async () => {
      const onSend = jest.fn().mockResolvedValue(undefined);
      const attachRef = React.createRef<ChatInputHandle>();
      const { getByLabelText, getByTestId, queryByLabelText } = renderInput({ onSend, attachRef });

      await attachOne(attachRef);
      act(() => {
        uploading().begin('up-1');
      });
      fireEvent.changeText(getByLabelText('Message input'), 'read this');
      await act(async () => {
        fireEvent.press(getByTestId('send-button'));
      });
      fireEvent.changeText(getByLabelText('Message input'), 'read this, and also');

      expect(queryByLabelText('Sending when the upload finishes')).toBeNull();
      await act(async () => {
        uploading().settle('up-1', 'done');
      });

      expect(onSend).not.toHaveBeenCalled();
      expect(getByLabelText('Message input').props.value).toBe('read this, and also');
    });

    it('sends straight away when nothing is in flight', async () => {
      const onSend = jest.fn().mockResolvedValue(undefined);
      const { getByLabelText, getByTestId } = renderInput({ onSend });

      fireEvent.changeText(getByLabelText('Message input'), 'no files here');
      await act(async () => {
        fireEvent.press(getByTestId('send-button'));
      });

      expect(onSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('Work usage limit', () => {
    function enterCloudWork() {
      mockAppMode = 'cloud';
      mockIsClerkSignedIn = true;
      mockTierState = { ...mockTierState, tier: 'pro' };
      useChatViewStore.setState({ workMode: 'agiwork' });
    }

    it('shows the out-of-usage card and blocks send while Work usage is exhausted', async () => {
      enterCloudWork();
      const onSend = jest.fn();
      const { getByLabelText, getByTestId, getByText } = renderInput({
        onSend,
        exhaustedUsageRecovery: 'add_credits',
      });

      expect(getByTestId('chat.composer.work-usage')).toBeTruthy();
      expect(getByText('Add credits')).toBeTruthy();

      fireEvent.changeText(getByLabelText('Message input'), 'Plan the launch');
      expect(getByTestId('send-button').props.accessibilityState?.disabled).toBe(true);
      await act(async () => {
        fireEvent.press(getByTestId('send-button'));
      });
      expect(onSend).not.toHaveBeenCalled();
      expect(getByLabelText('Message input').props.value).toBe('Plan the launch');
    });

    it('sends in Work once usage is no longer exhausted', async () => {
      enterCloudWork();
      const onSend = jest.fn();
      const { getByLabelText, getByTestId, queryByTestId } = renderInput({
        onSend,
        exhaustedUsageRecovery: null,
      });

      expect(queryByTestId('chat.composer.work-usage')).toBeNull();
      fireEvent.changeText(getByLabelText('Message input'), 'Plan the launch');
      await act(async () => {
        fireEvent.press(getByTestId('send-button'));
      });
      expect(onSend).toHaveBeenCalledWith('Plan the launch', undefined);
    });

    it('leaves a Chat-mode send to the server even when the usage reading is exhausted', async () => {
      mockAppMode = 'cloud';
      mockIsClerkSignedIn = true;
      mockTierState = { ...mockTierState, tier: 'pro' };
      const onSend = jest.fn();
      const { getByLabelText, getByTestId, queryByTestId } = renderInput({
        onSend,
        exhaustedUsageRecovery: 'add_credits',
      });

      expect(queryByTestId('chat.composer.work-usage')).toBeNull();
      fireEvent.changeText(getByLabelText('Message input'), 'Hello');
      await act(async () => {
        fireEvent.press(getByTestId('send-button'));
      });
      expect(onSend).toHaveBeenCalledWith('Hello', undefined);
    });
  });

  describe('auto-correct preference', () => {
    it('keeps the platform auto-correct and spell check on by default', () => {
      const { getByLabelText } = renderInput();
      const input = getByLabelText('Message input');
      expect(input.props.autoCorrect).toBe(true);
      expect(input.props.spellCheck).toBe(true);
    });

    it('turns auto-correct and spell check off when the setting is off', () => {
      useLocalSettingsStore.setState({ autoCorrectEnabled: false });
      const { getByLabelText } = renderInput();
      const input = getByLabelText('Message input');
      expect(input.props.autoCorrect).toBe(false);
      expect(input.props.spellCheck).toBe(false);
    });
  });

  describe('multiline signal', () => {
    it('tells the host when the text wraps and when it returns to one line', () => {
      const onMultilineChange = jest.fn();
      const { getByLabelText } = renderInput({ onMultilineChange });
      expect(onMultilineChange).toHaveBeenLastCalledWith(false);

      fireEvent.changeText(getByLabelText('Message input'), 'line one\nline two\nline three');
      stackComposer(getByLabelText);
      expect(onMultilineChange).toHaveBeenLastCalledWith(true);

      fireEvent.changeText(getByLabelText('Message input'), '');
      expect(onMultilineChange).toHaveBeenLastCalledWith(false);
    });
  });

  describe('text signal', () => {
    it('tells the host only when the composer gains or loses text', () => {
      const onHasTextChange = jest.fn();
      const { getByLabelText, unmount } = renderInput({ onHasTextChange });
      expect(onHasTextChange).toHaveBeenLastCalledWith(false);

      fireEvent.changeText(getByLabelText('Message input'), 'h');
      expect(onHasTextChange).toHaveBeenLastCalledWith(true);
      const callsAfterFirstLetter = onHasTextChange.mock.calls.length;

      fireEvent.changeText(getByLabelText('Message input'), 'hello there');
      expect(onHasTextChange).toHaveBeenCalledTimes(callsAfterFirstLetter);

      fireEvent.changeText(getByLabelText('Message input'), '   ');
      expect(onHasTextChange).toHaveBeenLastCalledWith(false);

      fireEvent.changeText(getByLabelText('Message input'), 'again');
      expect(onHasTextChange).toHaveBeenLastCalledWith(true);
      unmount();
      expect(onHasTextChange).toHaveBeenLastCalledWith(false);
    });
  });

  describe('the keys and controls a phone gives the composer', () => {
    it('leaves the return key as a newline and never as send', () => {
      const { getByLabelText } = renderInput();
      const input = getByLabelText('Message input');

      expect(input.props.multiline).toBe(true);
      expect(input.props.returnKeyType).toBe('default');
      expect(input.props.blurOnSubmit).toBe(false);
      expect(input.props.onSubmitEditing).toBeUndefined();
    });

    it('gives the phone a send control of its own, since the key will not do it', () => {
      const onSend = jest.fn().mockResolvedValue(undefined);
      const { getByLabelText, getByTestId } = renderInput({ onSend });

      fireEvent.changeText(getByLabelText('Message input'), 'by button only');
      expect(getByTestId('chat.composer.send')).toBeTruthy();
      act(() => {
        fireEvent.press(getByTestId('send-button'));
      });

      expect(onSend).toHaveBeenCalledWith('by button only', undefined);
    });
  });
});
