/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for ChatInput component.
 *
 * Validates the restructured chat input bar:
 * - [+] button, model label, mic button, send button presence
 * - [+] calls onOpenAddToChat
 * - Streaming state: placeholder text, stop button
 * - Send triggers message send
 * - Disabled state shows "You're offline" placeholder
 * - PAR-M05: expand-to-full-screen editor on the stacked composer card
 * - PAR-M19: the model label on the composer's control row
 */

import React from 'react';
import { Keyboard, TextInput } from 'react-native';
import { render, fireEvent, waitFor, act, within } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — declared before imports
// ---------------------------------------------------------------------------

let mockSelectedModel = 'claude-sonnet-5';
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

// ModelSelectorButton is deliberately NOT mocked: PAR-M19's whole point is that
// the composer renders a real model label (display name, never a wire id) wired
// to onOpenModelPicker, and a stub would assert nothing about that.

let capturedAttachmentPreviewProps:
  | {
      attachments: Array<{ id: string; fileName: string; pastedText?: string }>;
      onExpandPastedText?: (id: string) => void;
    }
  | undefined;

jest.mock('../src/features/chat/components/AttachmentPreview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    AttachmentPreview: (props: {
      attachments: Array<{ id: string; fileName: string; pastedText?: string }>;
      onExpandPastedText?: (id: string) => void;
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
    }: {
      state: string;
      onPress: () => void;
      disabled?: boolean;
    }) => (
      <Pressable
        onPress={onPress}
        disabled={disabled && state === 'idle'}
        testID="send-button"
        accessibilityLabel={state === 'streaming' ? 'Stop generating' : 'Send message'}
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

let lastVoiceResetSignal: number | undefined;

jest.mock('../src/features/voice/components/VoiceInputButton', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    VoiceInputButton: (props: { resetSignal?: number; onRecordingStart?: () => void }) => {
      lastVoiceResetSignal = props.resetSignal;
      // Capture onRecordingStart so tests can drive the component into its
      // recording state (which reveals the inline "Stop recording" button
      // wired to handleOverlaySend — the RecordingOverlay component was removed).
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

let capturedOverlaySend: (() => void) | undefined;
let capturedOverlayCancel: (() => void) | undefined;

jest.mock('../src/features/voice/components/RecordingOverlay', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    RecordingOverlay: (props: { onSend: () => void; onCancel: () => void }) => {
      capturedOverlaySend = props.onSend;
      capturedOverlayCancel = props.onCancel;
      return <View testID="recording-overlay" />;
    },
  };
});

jest.mock('../src/features/voice/services/voice', () => ({
  isRecording: jest.fn().mockReturnValue(false),
  cancelRecording: jest.fn().mockResolvedValue(undefined),
  stopRecording: jest.fn().mockResolvedValue('mock-uri'),
  transcribe: jest.fn().mockResolvedValue({ text: '' }),
}));

jest.mock('../src/features/model-picker/store', () => ({
  useModelStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      selectedModel: mockSelectedModel,
      thinkingEnabledPerModel: {},
    }),
}));

jest.mock('../src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ appMode: mockAppMode }),
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

jest.mock('../src/features/model-picker/service', () => ({
  getShortDisplayName: (id: string) => {
    if (id === 'claude-sonnet-5') return 'Claude Sonnet 5';
    return id;
  },
}));

jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ hapticsEnabled: false, themeMode: 'dark' }),
}));

jest.mock('../src/ui/theme', () => {
  // Declared inside the factory: the factory runs while ChatInput is being
  // required, which is before any module-scope const in this file initialises.
  const themeColors = {
    background: '#0f0f0f',
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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { ChatInput, type ChatInputHandle } from '../src/features/chat/components/ChatInput';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/**
 * Drive the composer into its stacked (card) layout the way the real one gets
 * there: the TextInput reports a rendered height taller than a single line.
 * Character count alone never restacks it — the layout is measured, not counted
 * — so a paste has to be followed by the content-size event it would fire.
 */
function stackComposer(input: ReturnType<typeof renderInput>['getByLabelText']) {
  fireEvent(input('Message input'), 'contentSizeChange', {
    nativeEvent: { contentSize: { width: 280, height: 96 } },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatInput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastVoiceResetSignal = undefined;
    capturedOverlaySend = undefined;
    capturedOverlayCancel = undefined;
    capturedRecordingStart = undefined;
    capturedAttachmentPreviewProps = undefined;
    mockSelectedModel = 'claude-sonnet-5';
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
    mockGetDraft.mockReturnValue('');
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

  // ---- Button presence ----

  describe('button presence', () => {
    it('renders [+] button', () => {
      const { getByLabelText } = renderInput();
      expect(getByLabelText('Add to chat')).toBeTruthy();
    });

    // No chip row ABOVE the composer (founder 2026-07-29 moved Model into the
    // "+" sheet). PAR-M19 puts the label back INSIDE the composer, on the
    // control row that only exists once the card stacks — never as a separate
    // row above it, and never in the compact pill where it would eat the
    // single-line input's width.
    it('keeps the model label out of the compact pill', () => {
      const { queryByTestId } = renderInput();
      expect(queryByTestId('chat.composer.model')).toBeNull();
    });

    it('renders mic button', () => {
      const { getByTestId } = renderInput();
      expect(getByTestId('voice-input-button')).toBeTruthy();
    });

    it('renders voice-mode button when composer is empty and onOpenVoiceMode is set', () => {
      // The composer's right circle is a state slot (ChatGPT reference:
      // empty -> voice-mode waveform, typing -> send, streaming -> stop).
      // Send-with-content is covered separately in "sending messages" below.
      const { getByLabelText } = renderInput();
      expect(getByLabelText('Start voice mode')).toBeTruthy();
    });

    it('renders send button once the composer has content', () => {
      const { getByLabelText, getByTestId } = renderInput();
      fireEvent.changeText(getByLabelText('Message input'), 'Hello');
      expect(getByTestId('send-button')).toBeTruthy();
    });
  });

  // ---- [+] button behaviour ----

  describe('[+] button', () => {
    it('calls onOpenAddToChat when pressed', () => {
      const onOpenAddToChat = jest.fn();
      const { getByLabelText } = renderInput({ onOpenAddToChat });

      fireEvent.press(getByLabelText('Add to chat'));

      expect(onOpenAddToChat).toHaveBeenCalledTimes(1);
    });
  });

  describe('active Cloud tools', () => {
    // Web search has no user toggle -- it is on for every capable signed-in
    // cloud model, so the composer never renders a "Search" status chip
    // (founder 2026-07-29). Only user-toggled tools get a chip.
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

    it('keeps enabled Research and Code options visible after the sheet closes', () => {
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

      const { getByLabelText, queryByLabelText, rerender } = renderInput();

      expect(getByLabelText('Deep Research active')).toBeTruthy();
      expect(getByLabelText('Code execution active')).toBeTruthy();
      // Image is a MODE now, not a toggle, so it has no status chip here — see
      // the regression note below.
      expect(queryByLabelText('Image generation active')).toBeNull();

      mockChatFeatures = {
        ...mockChatFeatures,
        research: false,
        codeExecution: false,
        imageGen: false,
      };
      rerender(<ChatInput {...defaultProps} />);

      expect(queryByLabelText('Deep Research active')).toBeNull();
      expect(queryByLabelText('Code execution active')).toBeNull();
      expect(queryByLabelText('Image generation active')).toBeNull();
    });

    /**
     * Regression guard. The "Image generation active" chip was driven by
     * `features.imageGen`, which WAS a switch in the + sheet. That switch became
     * the Image mode (2026-08-06), leaving the flag pinned at its `true` default
     * with no way to turn it off — so the chip rendered on every signed-in Cloud
     * chat and reported a choice the user had never made. It must stay gone even
     * when every capability is granted and the flag is on.
     */
    /**
     * The [+] tap must drop the keyboard first. Without it the sheet animated
     * to its snap point BEHIND a raised keyboard: only the "Add to Chat" header
     * cleared the keys, and every row inside was unreachable.
     */
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

  // ---- Streaming state ----

  describe('streaming state', () => {
    it('shows "Reply to [model]..." placeholder during streaming', () => {
      const { getByLabelText } = renderInput({ isStreaming: true });

      const input = getByLabelText('Message input');
      expect(input.props.placeholder).toBe('Reply to Claude Sonnet 5...');
    });

    it('shows stop button instead of send during streaming', () => {
      const { getByLabelText } = renderInput({ isStreaming: true });

      expect(getByLabelText('Stop generating')).toBeTruthy();
    });
  });

  // ---- Sending messages ----

  describe('sending messages', () => {
    it('send button triggers onSend with text', async () => {
      const onSend = jest.fn();
      const { getByLabelText, getByTestId } = renderInput({ onSend });

      // Type text
      const input = getByLabelText('Message input');
      fireEvent.changeText(input, 'Hello world');

      // Press send. Awaited: acceptance resolves on a microtask and clears the
      // draft, so an un-awaited press leaves that update outside act().
      await act(async () => {
        fireEvent.press(getByTestId('send-button'));
      });

      expect(onSend).toHaveBeenCalledWith('Hello world', undefined);
    });

    it('clears the input only after the send is accepted (not on tap)', async () => {
      let resolveSend!: (accepted: boolean) => void;
      const onSend = jest.fn(() => new Promise<boolean>((resolve) => (resolveSend = resolve)));
      const { getByLabelText, getByTestId } = renderInput({ onSend });

      const input = getByLabelText('Message input');
      fireEvent.changeText(input, 'Draft-safe message');
      fireEvent.press(getByTestId('send-button'));

      // Still pending — the draft must remain visible.
      expect(input.props.value).toBe('Draft-safe message');

      await act(async () => {
        resolveSend(true);
      });

      await waitFor(() => {
        expect(getByLabelText('Message input').props.value).toBe('');
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

    it('ignores a second tap while the first send is still awaiting acceptance', async () => {
      let resolveSend!: (accepted: boolean) => void;
      const onSend = jest.fn(() => new Promise<boolean>((resolve) => (resolveSend = resolve)));
      const { getByLabelText, getByTestId } = renderInput({ onSend });

      fireEvent.changeText(getByLabelText('Message input'), 'Once only');
      fireEvent.press(getByTestId('send-button'));
      fireEvent.press(getByTestId('send-button'));

      expect(onSend).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveSend(true);
      });
    });
  });

  // ---- Large paste -> attachment ----

  describe('large paste conversion', () => {
    it('converts a >10k-char paste into a "Pasted text" attachment and keeps prior text', () => {
      const { getByLabelText } = renderInput();

      const input = getByLabelText('Message input');
      fireEvent.changeText(input, 'Review this:');

      const bigBlock = 'x'.repeat(12_000);
      fireEvent.changeText(input, `Review this:${bigBlock}`);

      // Input keeps only the pre-paste text; the block became an attachment.
      expect(getByLabelText('Message input').props.value).toBe('Review this:');
      const pasted = capturedAttachmentPreviewProps?.attachments.find((a) => a.pastedText);
      expect(pasted).toBeTruthy();
      expect(pasted!.fileName).toBe('Pasted text');
      expect(pasted!.pastedText).toBe(bigBlock);
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
      // The pasted-text pseudo-attachment is NOT sent as a file.
      expect(sentAttachments).toBeUndefined();
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

  // ---- Disabled state ----

  describe('offline state', () => {
    it('shows offline placeholder when isOnline is false', () => {
      const { getByLabelText } = renderInput({ isOnline: false });

      const input = getByLabelText('Message input');
      expect(input.props.placeholder).toContain('Offline');
    });
  });

  // ---- Voice recording overlay "Send" reset signal ----

  describe('recording overlay send', () => {
    it('bumps voiceResetSignal even when the recording session already ended', async () => {
      // Regression: on the iOS Simulator (no mic) — and in a real race on
      // device — VoiceService.isRecording() can already be false by the time
      // "Send recording" is tapped. The old handler returned early in that
      // case WITHOUT bumping voiceResetSignal, so VoiceInputButton's internal
      // state stayed stuck on "recording" (red mic, "Tap to stop recording"
      // a11y label) with no way back short of triggering a second, unrelated
      // error path.

      const VoiceService = require('../src/features/voice/services/voice');
      VoiceService.isRecording.mockReturnValue(false);

      const { getByLabelText } = renderInput();
      // Drive the component into its recording state so the inline "Use
      // recording" send button (wired to handleOverlaySend) renders.
      act(() => {
        capturedRecordingStart!();
      });
      const signalBefore = lastVoiceResetSignal;

      await act(async () => {
        fireEvent.press(getByLabelText('Stop recording'));
      });

      await waitFor(() => {
        expect(lastVoiceResetSignal).toBe((signalBefore ?? 0) + 1);
      });
      expect(VoiceService.stopRecording).not.toHaveBeenCalled();
      expect(VoiceService.transcribe).not.toHaveBeenCalled();
    });

    it('bumps voiceResetSignal after a normal send with an active recording', async () => {
      const VoiceService = require('../src/features/voice/services/voice');
      VoiceService.isRecording.mockReturnValue(true);
      VoiceService.transcribe.mockResolvedValue({ text: 'hello from voice' });

      const onSend = jest.fn();
      const { getByLabelText } = renderInput({ onSend });
      act(() => {
        capturedRecordingStart!();
      });
      const signalBefore = lastVoiceResetSignal;

      await act(async () => {
        fireEvent.press(getByLabelText('Stop recording'));
      });

      await waitFor(() => {
        expect(lastVoiceResetSignal).toBe((signalBefore ?? 0) + 1);
      });
      expect(VoiceService.stopRecording).toHaveBeenCalledTimes(1);
    });
  });

  // ---- PAR-M05: expand a long message into a full-screen editor ----

  describe('expand to full-screen editor', () => {
    const LONG_PASTE = 'a'.repeat(800);

    it('offers no expand control while the composer is a one-line pill', () => {
      const { queryByTestId } = renderInput();
      expect(queryByTestId('chat.composer.expand')).toBeNull();
    });

    it('reveals the expand control once a long paste stacks the card', () => {
      const { getByLabelText, queryByTestId } = renderInput();

      fireEvent.changeText(getByLabelText('Message input'), LONG_PASTE);
      // Below LARGE_PASTE_THRESHOLD, so it stays in the input rather than
      // becoming a "Pasted text" attachment — this is the IMG_0672 case.
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

      // Opened with the composer's exact text — no fork, no truncation.
      const expanded = getByTestId('chat.composer.fullscreen.input');
      expect(expanded.props.value).toBe(LONG_PASTE);

      // Edits made full screen land in the composer's own state.
      fireEvent.changeText(expanded, `${LONG_PASTE} edited`);
      expect(getByTestId('chat.composer.fullscreen.input').props.value).toBe(
        `${LONG_PASTE} edited`,
      );

      fireEvent.press(getByTestId('chat.composer.fullscreen.collapse'));

      expect(queryByTestId('chat.composer.fullscreen.input')).toBeNull();
      expect(getByLabelText('Message input').props.value).toBe(`${LONG_PASTE} edited`);
    });

    it('sends from the expanded editor and closes it', async () => {
      const onSend = jest.fn();
      const { getByLabelText, getByTestId, queryByTestId } = renderInput({ onSend });

      fireEvent.changeText(getByLabelText('Message input'), LONG_PASTE);
      stackComposer(getByLabelText);
      fireEvent.press(getByTestId('chat.composer.expand'));

      // Scoped: the inline composer's send button is still mounted behind the
      // modal, so an unscoped testID query would match two nodes.
      const expandedSend = within(getByTestId('chat.composer.fullscreen.send')).getByTestId(
        'send-button',
      );
      // Awaited: acceptance of the send resolves a promise that clears the
      // draft, and that state update has to settle inside act().
      await act(async () => {
        fireEvent.press(expandedSend);
      });

      expect(onSend).toHaveBeenCalledWith(LONG_PASTE, undefined);
      expect(queryByTestId('chat.composer.fullscreen.input')).toBeNull();
      expect(getByLabelText('Message input').props.value).toBe('');
    });

    it('matches the composer snapshot in both layouts', () => {
      const compact = renderInput();
      expect(compact.toJSON()).toMatchSnapshot('compact (stacked=false)');
      compact.unmount();

      const stacked = renderInput();
      fireEvent.changeText(stacked.getByLabelText('Message input'), LONG_PASTE);
      stackComposer(stacked.getByLabelText);
      expect(stacked.toJSON()).toMatchSnapshot('stacked (stacked=true)');
    });
  });

  // ---- PAR-M19: the model answering the chat is readable and tappable ----

  describe('model label', () => {
    it('renders the display name on the control row and opens the picker', () => {
      const onOpenModelPicker = jest.fn();
      const { getByLabelText, getByTestId, queryByText } = renderInput({ onOpenModelPicker });

      stackComposer(getByLabelText);

      const label = getByTestId('chat.composer.model');
      // The display name, never the wire id.
      expect(within(label).getByText('Claude Sonnet 5')).toBeTruthy();
      expect(queryByText('claude-sonnet-5')).toBeNull();
      expect(label.props.accessibilityLabel).toContain('Model: Claude Sonnet 5');

      fireEvent.press(label);
      expect(onOpenModelPicker).toHaveBeenCalledTimes(1);
    });

    it('renders no label when the host offers no way to change the model', () => {
      const { getByLabelText, queryByTestId } = renderInput({ onOpenModelPicker: undefined });

      stackComposer(getByLabelText);

      expect(queryByTestId('chat.composer.model')).toBeNull();
    });
  });

  // ---- Imperative handle ----

  describe('composer handle', () => {
    it('exposes focus() and drives the real text field with it', () => {
      // VoiceInlineBar's "Ask AGI" pill has to land the user in a FOCUSED
      // composer; without this the host can only re-render a blurred one.
      // Spying on the TextInput instance method (rather than asserting the
      // handle merely exists) is what proves the handle is wired to the field.
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
  });
});
