import { Modal } from 'react-native';
import { act, fireEvent, render as renderNative, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  RESPONSE_RATING_COMMENT_MAX_CHARS,
  RESPONSE_RATING_RATE_LIMITED,
  RESPONSE_RATING_REASONS,
  RESPONSE_RATING_REASON_LABELS,
  RESPONSE_RATING_SEND_FAILED,
  RESPONSE_RATING_SHARING_NOTE,
} from '@agiworkforce/cloud-contracts';
import { MessageBubble } from '@/src/features/chat/components/MessageBubble';
import {
  ResponseRatingDetails,
  responseRatingDetailsFailure,
} from '@/src/features/chat/components/ResponseRatingDetails';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useArtifactStore } from '@/src/features/artifacts/store';
import { useChatExecutionStore } from '@/stores/chat/chatExecutionStore';
import type { ChatMessage } from '@/types/chat';

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

function answer(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'answer-1',
    conversationId: 'conversation-1',
    role: 'assistant',
    content: 'Here are the steps.',
    createdAt: '2026-11-14T00:00:00.000Z',
    ...overrides,
  };
}

function chooseFromMore(key: string): void {
  fireEvent.press(screen.getByRole('button', { name: /^More message actions/ }));
  const menu = screen
    .UNSAFE_getAllByType(Modal)
    .find((modal) => modal.props.visible && modal.props.onDismiss);
  fireEvent.press(screen.getByTestId(`message-action-${key}`));
  act(() => menu!.props.onDismiss());
}

function submitButton() {
  return screen.getByTestId('response-rating-submit');
}

describe('the Tell us more sheet after a bad rating', () => {
  it('offers every shared reason, the comment cap and the sharing note', () => {
    render(<ResponseRatingDetails visible onSubmit={jest.fn()} onClose={jest.fn()} />);

    expect(screen.getByRole('header', { name: 'Tell us more' })).toBeTruthy();
    for (const reason of RESPONSE_RATING_REASONS) {
      const chip = screen.getByRole('button', { name: RESPONSE_RATING_REASON_LABELS[reason] });
      expect(chip).toHaveStyle({ minHeight: 44 });
    }
    expect(screen.getByTestId('response-rating-comment').props.maxLength).toBe(
      RESPONSE_RATING_COMMENT_MAX_CHARS,
    );
    expect(screen.getByText(RESPONSE_RATING_SHARING_NOTE)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close feedback form' })).toHaveStyle({
      width: 44,
      height: 44,
    });
  });

  it('keeps Submit off until a reason or a comment is given, and a second tap clears a reason', () => {
    render(<ResponseRatingDetails visible onSubmit={jest.fn()} onClose={jest.fn()} />);
    const incomplete = RESPONSE_RATING_REASON_LABELS.incomplete;

    expect(submitButton().props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByRole('button', { name: incomplete }));
    expect(screen.getByRole('button', { name: incomplete }).props.accessibilityState).toMatchObject(
      { selected: true },
    );
    expect(submitButton().props.accessibilityState).toMatchObject({ disabled: false });
    fireEvent.press(screen.getByRole('button', { name: incomplete }));
    expect(submitButton().props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.changeText(screen.getByTestId('response-rating-comment'), '   ');
    expect(submitButton().props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.changeText(screen.getByTestId('response-rating-comment'), 'Missed step three');
    expect(submitButton().props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('sends the reason and the trimmed comment, then closes', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    render(<ResponseRatingDetails visible onSubmit={onSubmit} onClose={onClose} />);

    fireEvent.press(
      screen.getByRole('button', { name: RESPONSE_RATING_REASON_LABELS.ignored_instructions }),
    );
    fireEvent.changeText(screen.getByTestId('response-rating-comment'), '  Asked for a table.  ');
    await act(async () => {
      fireEvent.press(submitButton());
    });

    expect(onSubmit).toHaveBeenCalledWith({
      reason: 'ignored_instructions',
      comment: 'Asked for a table.',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sends the details once however quickly Submit is pressed again', async () => {
    let finish: () => void = () => undefined;
    const onSubmit = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<ResponseRatingDetails visible onSubmit={onSubmit} onClose={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: RESPONSE_RATING_REASON_LABELS.other }));
    act(() => {
      fireEvent.press(submitButton());
      fireEvent.press(submitButton());
    });
    expect(screen.getByRole('button', { name: 'Sending feedback' })).toBeTruthy();
    fireEvent.press(submitButton());
    await act(async () => finish());

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('stays open with the failure sentence and the person’s words when sending fails', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error(RESPONSE_RATING_RATE_LIMITED));
    const onClose = jest.fn();
    render(<ResponseRatingDetails visible onSubmit={onSubmit} onClose={onClose} />);

    fireEvent.changeText(screen.getByTestId('response-rating-comment'), 'Too long');
    await act(async () => {
      fireEvent.press(submitButton());
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(RESPONSE_RATING_RATE_LIMITED);
    expect(screen.getByTestId('response-rating-comment').props.value).toBe('Too long');
    expect(submitButton().props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('falls back to the shared send failure when the error says nothing', () => {
    expect(responseRatingDetailsFailure(new Error('  '))).toBe(RESPONSE_RATING_SEND_FAILED);
    expect(responseRatingDetailsFailure('offline')).toBe(RESPONSE_RATING_SEND_FAILED);
  });

  it('closes from its close control', () => {
    const onClose = jest.fn();
    render(<ResponseRatingDetails visible onSubmit={jest.fn()} onClose={onClose} />);

    fireEvent.press(screen.getByRole('button', { name: 'Close feedback form' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Bad Response in More', () => {
  beforeEach(() => {
    mockShowToast.mockClear();
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useArtifactStore.setState({ artifacts: [] });
    useChatExecutionStore.setState({ streamingConversationIds: [] });
  });

  it('rates the answer down and asks for details when the chat can send them', async () => {
    const onReaction = jest.fn();
    const onSubmitRatingDetails = jest.fn().mockResolvedValue(undefined);
    render(
      <MessageBubble
        message={answer()}
        onReaction={onReaction}
        onSubmitRatingDetails={onSubmitRatingDetails}
      />,
    );

    expect(screen.queryByTestId('response-rating-details')).toBeNull();
    chooseFromMore('bad-response');

    expect(onReaction).toHaveBeenCalledWith('answer-1', 'thumbsDown');
    expect(screen.getByTestId('response-rating-details')).toBeTruthy();
    expect(mockShowToast).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: RESPONSE_RATING_REASON_LABELS.incomplete }));
    fireEvent.changeText(screen.getByTestId('response-rating-comment'), 'Missed step three');
    await act(async () => {
      fireEvent.press(submitButton());
    });

    expect(onSubmitRatingDetails).toHaveBeenCalledWith('answer-1', {
      reason: 'incomplete',
      comment: 'Missed step three',
    });
    expect(mockShowToast).toHaveBeenCalledWith('Thanks for your feedback');
    expect(screen.queryByTestId('response-rating-details')).toBeNull();
  });

  it('only acknowledges the rating where the chat cannot send details', () => {
    const onReaction = jest.fn();
    render(<MessageBubble message={answer()} onReaction={onReaction} />);

    chooseFromMore('bad-response');

    expect(onReaction).toHaveBeenCalledWith('answer-1', 'thumbsDown');
    expect(screen.queryByTestId('response-rating-details')).toBeNull();
    expect(mockShowToast).toHaveBeenCalledWith('Thanks for your feedback');
  });

  it('never asks for details on a good rating or when a bad rating is taken back', () => {
    const onReaction = jest.fn();
    const onSubmitRatingDetails = jest.fn();
    render(
      <MessageBubble
        message={answer({ metadata: { reaction: 'thumbsDown' } })}
        onReaction={onReaction}
        onSubmitRatingDetails={onSubmitRatingDetails}
      />,
    );

    chooseFromMore('bad-response');
    expect(onReaction).toHaveBeenLastCalledWith('answer-1', null);
    expect(screen.queryByTestId('response-rating-details')).toBeNull();
    expect(mockShowToast).toHaveBeenLastCalledWith('Rating removed');

    chooseFromMore('good-response');
    expect(onReaction).toHaveBeenLastCalledWith('answer-1', 'thumbsUp');
    expect(screen.queryByTestId('response-rating-details')).toBeNull();
    expect(onSubmitRatingDetails).not.toHaveBeenCalled();
  });
});
