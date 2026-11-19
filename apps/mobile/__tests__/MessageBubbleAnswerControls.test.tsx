import { Alert, Modal, type AlertButton } from 'react-native';
import { act, fireEvent, render as renderNative, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { State, TapGestureHandler } from 'react-native-gesture-handler';
import * as Clipboard from 'expo-clipboard';
import { MessageBubble } from '@/src/features/chat/components/MessageBubble';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useArtifactStore } from '@/src/features/artifacts/store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { useChatExecutionStore } from '@/stores/chat/chatExecutionStore';
import { answerClipboardText } from '@/src/features/chat/utils/markdownPlainText';
import { COPIED_LABEL, COPY_CONFIRMATION_MS } from '@/src/shared/hooks/useCopyAction';
import { documentTitleFromAnswer } from '@agiworkforce/unified-chat/answer-document';
import { markUnsavedAnswerEdit } from '@/src/features/chat/components/AssistantDraftScope';
import {
  clearAnswerDrafts,
  writeAnswerDraft,
} from '@/src/features/chat/components/answerDraftStore';
import type { ChatMessage } from '@/types/chat';
import { READ_ALOUD_UNAVAILABLE_REASON } from '@/src/features/voice/services/readAloudAvailability';
import type {
  VoiceOutputHandle,
  VoiceOutputOutcome,
  VoiceOutputOwner,
} from '@/src/features/voice/services/voiceOutput';

const mockShowToast = jest.fn();
jest.mock('@/src/shared/components/Toast', () => ({
  ...jest.requireActual('@/src/shared/components/Toast'),
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

function render(ui: React.ReactElement) {
  return renderNative(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          insets: { top: 0, bottom: 0, left: 0, right: 0 },
          frame: { x: 0, y: 0, width: 390, height: 844 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

const ANSWER = [
  'Here is the draft.',
  '',
  '```email',
  'To: reader@example.com',
  'Subject: Review',
  '',
  'An editable message.',
  '```',
].join('\n');

function assistant(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'answer-1',
    conversationId: 'conversation-1',
    role: 'assistant',
    content: ANSWER,
    createdAt: '2026-11-14T00:00:00.000Z',
    ...overrides,
  };
}

function user(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'question-1',
    conversationId: 'conversation-1',
    role: 'user',
    content: 'Keep **this** exactly.',
    createdAt: '2026-11-14T00:00:00.000Z',
    ...overrides,
  };
}

function openSheet(): void {
  fireEvent(screen.getByTestId('chat.message.content'), 'longPress');
}

function chooseFromSheet(key: string): void {
  const menu = screen
    .UNSAFE_getAllByType(Modal)
    .find((modal) => modal.props.visible && modal.props.onDismiss);
  fireEvent.press(screen.getByTestId(`message-action-${key}`));
  act(() => menu!.props.onDismiss());
}

function speechOwner(outcome: VoiceOutputOutcome, current = true): VoiceOutputOwner {
  return {
    source: { scope: 'local' },
    isCurrent: () => current,
    start: jest.fn((): VoiceOutputHandle => ({
      done: Promise.resolve(outcome),
      stop: jest.fn().mockResolvedValue(undefined),
    })),
    stop: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn().mockResolvedValue(undefined),
  };
}

describe('the controls under and inside a message', () => {
  beforeEach(() => {
    jest.mocked(Clipboard.setStringAsync).mockClear();
    mockShowToast.mockClear();
    useChatAppModeStore.setState({ appMode: 'local' });
    useArtifactStore.setState({ artifacts: [] });
    useChatExecutionStore.setState({ streamingConversationIds: [] });
  });

  it('copies an answer as the plain text the reader sees, not its fences', async () => {
    render(<MessageBubble message={assistant()} />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Copy' }));
    });

    const copied = jest.mocked(Clipboard.setStringAsync).mock.calls.at(-1)?.[0];
    expect(copied).toBe(answerClipboardText(ANSWER));
    expect(copied).not.toContain('```');
    expect(copied).toContain('An editable message.');
  });

  it('holds the Copied confirmation on the answer Copy control as long as the code card does', async () => {
    jest.useFakeTimers();
    try {
      render(<MessageBubble message={assistant()} />);

      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Copy' }));
      });
      expect(screen.getByRole('button', { name: COPIED_LABEL })).toBeOnTheScreen();

      act(() => jest.advanceTimersByTime(COPY_CONFIRMATION_MS - 100));
      expect(screen.getByRole('button', { name: COPIED_LABEL })).toBeOnTheScreen();

      act(() => jest.advanceTimersByTime(200));
      expect(screen.getByRole('button', { name: 'Copy' })).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it('copies a person’s own message exactly as typed', async () => {
    render(<MessageBubble message={user()} />);

    openSheet();
    await act(async () => {
      chooseFromSheet('copy');
    });

    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith('Keep **this** exactly.');
  });

  it('shows a person’s own message verbatim in Select Text', () => {
    render(<MessageBubble message={user()} onQuoteSelection={jest.fn()} />);

    openSheet();
    chooseFromSheet('select-text');

    expect(screen.getByTestId('select-text-input').props.value).toBe('Keep **this** exactly.');
  });

  it('double tap only gives and takes back a good rating, with an acknowledgement', () => {
    const onReaction = jest.fn();
    render(<MessageBubble message={assistant()} onReaction={onReaction} />);
    const doubleTap = () =>
      act(() =>
        screen
          .UNSAFE_getByType(TapGestureHandler)
          .props.onHandlerStateChange({ nativeEvent: { state: State.ACTIVE } }),
      );

    doubleTap();
    doubleTap();
    doubleTap();

    expect(onReaction.mock.calls).toEqual([
      ['answer-1', 'thumbsUp'],
      ['answer-1', null],
      ['answer-1', 'thumbsUp'],
    ]);
    expect(mockShowToast.mock.calls.map(([text]) => text)).toEqual([
      'Thanks for your feedback',
      'Rating removed',
      'Thanks for your feedback',
    ]);
  });

  it('does not rate an answer that is still being written', () => {
    const onReaction = jest.fn();
    render(<MessageBubble message={assistant({ isStreaming: true })} onReaction={onReaction} />);

    act(() =>
      screen
        .UNSAFE_getByType(TapGestureHandler)
        .props.onHandlerStateChange({ nativeEvent: { state: State.ACTIVE } }),
    );

    expect(onReaction).not.toHaveBeenCalled();
  });

  it('offers only a partial copy and Select Text on an answer that is still being written', () => {
    render(
      <MessageBubble
        message={assistant({ isStreaming: true })}
        onRetryMessage={jest.fn()}
        onRetryWithModel={jest.fn()}
        onDeleteMessage={jest.fn()}
        onBranch={jest.fn()}
      />,
    );

    openSheet();

    expect(screen.getByRole('button', { name: 'Copy Partial Response' })).toBeOnTheScreen();
    expect(screen.getByTestId('message-action-select-text')).toBeOnTheScreen();
    for (const key of ['retry', 'retry-model', 'delete', 'branch', 'export']) {
      expect(screen.queryByTestId(`message-action-${key}`)).toBeNull();
    }
  });

  it('shows Regenerate and Retry as waiting while another answer in the chat is written', () => {
    useChatExecutionStore.setState({ streamingConversationIds: ['conversation-1'] });
    const onRetryMessage = jest.fn();
    render(<MessageBubble message={assistant()} onRetryMessage={onRetryMessage} />);

    const regenerate = screen.getByRole('button', { name: 'Regenerate response' });
    expect(regenerate.props.accessibilityState).toEqual({ disabled: true });
    expect(regenerate.props.accessibilityHint).toBe(
      'Available when the current response finishes.',
    );
    fireEvent.press(regenerate);

    openSheet();
    const retry = screen.getByTestId('message-action-retry');
    expect(retry.props.accessibilityState).toEqual({ disabled: true });
    expect(screen.getByText('Available when the current response finishes.')).toBeOnTheScreen();
    fireEvent.press(retry);

    expect(onRetryMessage).not.toHaveBeenCalled();
  });

  it('marks an answer waiting on an approval as partial and hides Regenerate', () => {
    render(
      <MessageBubble
        message={assistant({
          content: 'I will delete the old files once you approve.',
          toolCalls: [
            {
              id: 'tool-1',
              toolCallId: 'call-1',
              name: 'delete_files',
              status: 'awaiting-approval',
              requiresApproval: true,
            },
          ],
        })}
        onRetryMessage={jest.fn()}
      />,
    );

    expect(
      screen.getByText(
        'Waiting for approval. This response is partial; review the tool request to continue.',
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Regenerate response' })).toBeNull();
  });

  it('treats only a tool step of the activity as waiting on an approval', () => {
    const activity = (toolStatus: 'awaiting-approval' | 'completed') => ({
      schemaVersion: 1,
      sessionId: 'session-1',
      turnId: 'turn-1',
      lastSequence: 2,
      status: 'running',
      startedAtMs: 1,
      updatedAtMs: 2,
      entries: [
        {
          kind: 'progress',
          id: 'progress-1',
          progressId: 'progress-1',
          summary: 'Reasoning',
          status: 'completed',
          startedAtMs: 1,
        },
        {
          kind: 'tool',
          id: 'tool-1',
          toolCallId: 'call-1',
          name: 'delete_files',
          category: 'filesystem',
          summary: 'Delete the old files',
          status: toolStatus,
          startedAtMs: 1,
        },
      ],
    });
    const view = render(
      <MessageBubble
        message={assistant({
          content: 'I will delete the old files once you approve.',
          metadata: { agentActivity: activity('awaiting-approval') },
        })}
        onRetryMessage={jest.fn()}
      />,
    );
    expect(
      screen.getByText(
        'Waiting for approval. This response is partial; review the tool request to continue.',
      ),
    ).toBeOnTheScreen();

    view.rerender(
      <MessageBubble
        message={assistant({
          content: 'I deleted the old files.',
          metadata: { agentActivity: activity('completed') },
        })}
        onRetryMessage={jest.fn()}
      />,
    );
    expect(
      screen.queryByText(
        'Waiting for approval. This response is partial; review the tool request to continue.',
      ),
    ).toBeNull();
  });

  it('lets the reader dismiss the model substitution notice, which waits for the answer to finish', () => {
    const metadata = { fallbackReason: 'managed_failover' };
    const view = render(<MessageBubble message={assistant({ isStreaming: true, metadata })} />);
    expect(screen.queryByTestId('message-fallback-notice')).toBeNull();

    view.rerender(<MessageBubble message={assistant({ metadata })} />);
    expect(
      screen.getByText('The model you picked was unavailable, so a backup model answered.'),
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Dismiss model substitution notice' }));

    expect(screen.queryByTestId('message-fallback-notice')).toBeNull();
  });

  it('says so when read aloud cannot start or cannot play', async () => {
    const view = render(
      <MessageBubble message={assistant()} speechOwner={speechOwner({ status: 'done' }, false)} />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Read aloud' }));
    expect(mockShowToast).toHaveBeenLastCalledWith(READ_ALOUD_UNAVAILABLE_REASON.accountChanged);

    view.rerender(
      <MessageBubble
        message={assistant()}
        speechOwner={speechOwner({ status: 'failed', error: new Error('no voice') })}
      />,
    );
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Read aloud' }));
    });
    expect(mockShowToast).toHaveBeenLastCalledWith('Read aloud could not play. Try again.');
    expect(screen.getByRole('button', { name: 'Read aloud' })).toBeOnTheScreen();
  });
});

describe('editing a message that carries files', () => {
  const withFiles = user({
    content: 'Compare these.',
    attachments: [
      { url: 'file:///a.pdf', mimeType: 'application/pdf', fileName: 'a.pdf' },
      { url: 'file:///b.csv', mimeType: 'text/csv', fileName: 'b.csv' },
    ],
  });

  function openEditor(): void {
    fireEvent(
      screen.getByRole('text', { name: 'Your message: Compare these.' }),
      'accessibilityAction',
      { nativeEvent: { actionName: 'edit' } },
    );
  }

  beforeEach(() => {
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it('sends the edit without a file the person removed', () => {
    const onEditMessage = jest.fn().mockReturnValue(true);
    render(
      <MessageBubble message={withFiles} onEditMessage={onEditMessage} editAttachmentsSupported />,
    );

    openEditor();
    fireEvent.press(screen.getByRole('button', { name: 'Remove a.pdf' }));
    expect(screen.queryByRole('button', { name: 'Remove a.pdf' })).toBeNull();
    fireEvent.press(screen.getByLabelText('Submit edit'));

    expect(onEditMessage).toHaveBeenCalledWith('question-1', 'Compare these.', [
      { url: 'file:///b.csv', mimeType: 'text/csv', fileName: 'b.csv' },
    ]);
    expect(screen.queryByLabelText('Edit message text')).toBeNull();
  });

  it('closes without sending when nothing changed', () => {
    const onEditMessage = jest.fn().mockReturnValue(true);
    render(
      <MessageBubble message={withFiles} onEditMessage={onEditMessage} editAttachmentsSupported />,
    );

    openEditor();
    fireEvent.press(screen.getByLabelText('Submit edit'));

    expect(onEditMessage).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Edit message text')).toBeNull();
  });

  it('offers no remove control where the screen cannot send an edit without the file', () => {
    render(<MessageBubble message={withFiles} onEditMessage={jest.fn()} />);

    openEditor();

    expect(screen.queryByRole('button', { name: 'Remove a.pdf' })).toBeNull();
    expect(screen.getByText('These stay attached when you send the edit.')).toBeOnTheScreen();
  });

  it('gives each remove control a 44 point target', () => {
    render(
      <MessageBubble message={withFiles} onEditMessage={jest.fn()} editAttachmentsSupported />,
    );

    openEditor();

    expect(screen.getByRole('button', { name: 'Remove b.csv' })).toHaveStyle({
      width: 44,
      height: 44,
    });
  });
});

describe('saving an answer as a document', () => {
  beforeEach(() => {
    mockShowToast.mockClear();
    useArtifactStore.setState({ artifacts: [] });
    useChatExecutionStore.setState({ streamingConversationIds: [] });
  });

  it('keeps a Local answer as a Local document named from its first line', () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    render(<MessageBubble message={assistant({ content: `<think>Plan.</think>${ANSWER}` })} />);

    openSheet();
    chooseFromSheet('save-as-document');

    const saved = useArtifactStore.getState().artifacts;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toEqual(
      expect.objectContaining({
        kind: 'document',
        title: documentTitleFromAnswer(ANSWER),
        content: `${ANSWER}\n`,
        language: 'markdown',
        messageId: 'answer-1',
        provenance: { scope: 'local' },
      }),
    );
    expect(saved[0]!.title).toBe('Here is the draft.');
  });

  it('asks a signed-out person to sign in instead of saving a Cloud answer nowhere', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    render(<MessageBubble message={assistant()} />);

    openSheet();
    chooseFromSheet('save-as-document');

    expect(useArtifactStore.getState().artifacts).toEqual([]);
    expect(mockShowToast).toHaveBeenCalledWith('Sign in to save this answer as a document.');
  });

  const CLOUD_CHAT_ID = '0192f0a4-5b6c-7d8e-9f01-23456789abcd';
  const CLOUD_ANSWER_ID = '0192f0a4-5b6c-7d8e-9f01-23456789abce';

  it('ties a Cloud document to its chat, so an edit to it is sent to the cloud', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useArtifactStore.setState({ pendingCloudPushes: {} });
    activateCloudAccount('owner-1');
    try {
      render(
        <MessageBubble
          message={assistant({ id: CLOUD_ANSWER_ID, conversationId: CLOUD_CHAT_ID })}
        />,
      );

      openSheet();
      chooseFromSheet('save-as-document');

      const saved = useArtifactStore.getState().artifacts;
      expect(saved).toHaveLength(1);
      expect(saved[0]).toEqual(
        expect.objectContaining({
          messageId: CLOUD_ANSWER_ID,
          conversationId: CLOUD_CHAT_ID,
          artifactType: 'document',
          provenance: { scope: 'cloud', ownerId: 'owner-1' },
        }),
      );

      act(() => {
        useArtifactStore
          .getState()
          .saveArtifactEdit({ ...saved[0]!, content: `${saved[0]!.content}One more line.\n` });
      });

      const pushes = useArtifactStore.getState().pendingCloudArtifactPushes('owner-1');
      expect(pushes).toHaveLength(1);
      expect(pushes[0]).toEqual(
        expect.objectContaining({
          id: saved[0]!.id,
          conversationId: CLOUD_CHAT_ID,
          messageId: CLOUD_ANSWER_ID,
          artifactType: 'document',
        }),
      );
    } finally {
      __resetCloudAccountSessionForTests();
    }
  });

  it('is not offered while the answer is still being written', () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    render(<MessageBubble message={assistant({ isStreaming: true })} />);

    openSheet();

    expect(screen.queryByTestId('message-action-save-as-document')).toBeNull();
  });
});

describe('rerunning a turn whose answer holds unsaved draft edits', () => {
  const draftKey = 'answer-1\u0000email\u0000draft';
  let alert: jest.SpyInstance;

  function holdUnsavedEdit(): void {
    writeAnswerDraft(draftKey, { body: 'My own wording.' });
    markUnsavedAnswerEdit('answer-1', draftKey, true);
  }

  function pressAlertButton(text: string): void {
    const buttons = alert.mock.calls.at(-1)?.[2] as AlertButton[] | undefined;
    act(() => buttons?.find((button) => button.text === text)?.onPress?.());
  }

  beforeEach(() => {
    useChatAppModeStore.setState({ appMode: 'local' });
    useChatExecutionStore.setState({ streamingConversationIds: [] });
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    markUnsavedAnswerEdit('answer-1', draftKey, false);
    clearAnswerDrafts();
    alert.mockRestore();
  });

  it('regenerates at once when nothing in the answer was edited', () => {
    const onRetryMessage = jest.fn();
    render(<MessageBubble message={assistant()} onRetryMessage={onRetryMessage} />);

    fireEvent.press(screen.getByRole('button', { name: 'Regenerate response' }));

    expect(alert).not.toHaveBeenCalled();
    expect(onRetryMessage).toHaveBeenCalledWith('answer-1');
  });

  it('asks before Regenerate throws away the person’s draft edits, and keeps them on Keep editing', () => {
    holdUnsavedEdit();
    const onRetryMessage = jest.fn();
    render(<MessageBubble message={assistant()} onRetryMessage={onRetryMessage} />);

    fireEvent.press(screen.getByRole('button', { name: 'Regenerate response' }));

    expect(alert).toHaveBeenCalledWith(
      'Discard your unsaved changes?',
      'Regenerating replaces this answer, and the unsaved changes in it are lost.',
      [
        { text: 'Keep editing', style: 'cancel' },
        expect.objectContaining({ text: 'Discard and regenerate', style: 'destructive' }),
      ],
    );
    pressAlertButton('Keep editing');
    expect(onRetryMessage).not.toHaveBeenCalled();
    pressAlertButton('Discard and regenerate');
    expect(onRetryMessage).toHaveBeenCalledWith('answer-1');
  });

  it('asks the same way when the unsaved values are in a filled card rather than a draft', () => {
    const cardKey = 'answer-1\u0000clarify\u0000card-1';
    writeAnswerDraft(cardKey, { size: 'Large' });
    markUnsavedAnswerEdit('answer-1', cardKey, true);
    const onRetryMessage = jest.fn();
    render(<MessageBubble message={assistant()} onRetryMessage={onRetryMessage} />);

    fireEvent.press(screen.getByRole('button', { name: 'Regenerate response' }));

    expect(alert).toHaveBeenCalledWith(
      'Discard your unsaved changes?',
      'Regenerating replaces this answer, and the unsaved changes in it are lost.',
      expect.any(Array),
    );
    expect(onRetryMessage).not.toHaveBeenCalled();
    markUnsavedAnswerEdit('answer-1', cardKey, false);
  });

  it('asks before Retry with Another Model from the menu', () => {
    holdUnsavedEdit();
    const onRetryWithModel = jest.fn();
    render(<MessageBubble message={assistant()} onRetryWithModel={onRetryWithModel} />);

    openSheet();
    chooseFromSheet('retry-model');

    expect(onRetryWithModel).not.toHaveBeenCalled();
    pressAlertButton('Discard and regenerate');
    expect(onRetryWithModel).toHaveBeenCalledWith('answer-1');
  });

  it('asks before an edited question replaces the answer that holds the edits', () => {
    holdUnsavedEdit();
    const onEditMessage = jest.fn().mockReturnValue(true);
    render(
      <MessageBubble
        message={user({ content: 'Compare these.' })}
        onEditMessage={onEditMessage}
        nextAnswerId="answer-1"
      />,
    );

    fireEvent(
      screen.getByRole('text', { name: 'Your message: Compare these.' }),
      'accessibilityAction',
      { nativeEvent: { actionName: 'edit' } },
    );
    fireEvent.changeText(screen.getByLabelText('Edit message text'), 'Compare these two.');
    fireEvent.press(screen.getByLabelText('Submit edit'));

    expect(alert).toHaveBeenCalledWith(
      'Discard your unsaved changes?',
      'Editing your message replaces the answer below, and the unsaved changes in it are lost.',
      expect.any(Array),
    );
    expect(onEditMessage).not.toHaveBeenCalled();
    pressAlertButton('Discard and edit');
    expect(onEditMessage).toHaveBeenCalledWith('question-1', 'Compare these two.');
  });
});
