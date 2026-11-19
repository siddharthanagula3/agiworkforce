import { useRef } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { InteractiveCard, ClarifyCardBody } from '@agiworkforce/types';
import { renderMarkdownContent } from '@/src/features/chat/components/MessageContentRenderer';
import {
  AssistantDraftScope,
  hasUnsavedAnswerEdits,
} from '@/src/features/chat/components/AssistantDraftScope';
import { ClarifyCard } from '@/src/features/chat/components/ClarifyCard';
import { clearAnswerDrafts } from '@/src/features/chat/components/answerDraftStore';
import {
  ChatScrollIntoView,
  chatRevealOffset,
  type ScrollableChatList,
} from '@/src/features/chat/components/cards/ChatScrollIntoView';
import { lightColors } from '@/src/ui/theme/tokens';

const mockPickerChange = jest.fn();
const mockAndroidOpen = jest.fn();
jest.mock('@react-native-community/datetimepicker', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: (props: { onValueChange: (event: unknown, date: Date) => void; testID?: string }) => {
      mockPickerChange.mockImplementation((date: Date) => props.onValueChange({}, date));
      return <MockView testID={props.testID} />;
    },
    DateTimePickerAndroid: { open: (...args: unknown[]) => mockAndroidOpen(...args) },
  };
});

const FORM = [
  '```form',
  'title: Trip',
  'text: Name *',
  'select: Seat | Window | Aisle',
  'select: Meal * | Fish | Pasta',
  'date: Departure',
  'submit: Apply',
  '```',
].join('\n');

function Reply({ content, messageId }: { content: string; messageId?: string }) {
  const body = <View>{renderMarkdownContent(content, lightColors)}</View>;
  return messageId ? <AssistantDraftScope messageId={messageId}>{body}</AssistantDraftScope> : body;
}

const originalOS = Platform.OS;

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
  jest.restoreAllMocks();
  mockPickerChange.mockReset();
  mockAndroidOpen.mockReset();
  act(() => clearAnswerDrafts());
});

describe('answer form fields', () => {
  it('lets an optional select go back to empty, and not a required one', () => {
    render(<Reply content={FORM} />);
    fireEvent.press(screen.getByRole('button', { name: 'Seat, Choose an option' }));
    fireEvent.press(screen.getByRole('radio', { name: 'Aisle' }));
    fireEvent.press(screen.getByRole('button', { name: 'Seat, Aisle' }));
    fireEvent.press(screen.getByRole('radio', { name: 'None' }));
    expect(screen.getByRole('button', { name: 'Seat, Choose an option' })).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Meal, required, Choose an option' }));
    expect(screen.queryByRole('radio', { name: 'None' })).toBeNull();
  });

  it('fills a date field from the native date picker as YYYY-MM-DD', () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });
    render(<Reply content={FORM} />);
    fireEvent.press(screen.getByRole('button', { name: 'Departure, not set' }));
    expect(screen.getByTestId('answer-form-date-picker')).toBeOnTheScreen();
    act(() => mockPickerChange(new Date(2026, 11, 3, 12)));
    expect(screen.queryByRole('button', { name: 'Departure, not set' })).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Name, required'), 'Ada');
    fireEvent.press(screen.getByRole('button', { name: 'Meal, required, Choose an option' }));
    fireEvent.press(screen.getByRole('radio', { name: 'Fish' }));
    fireEvent.press(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByText('2026-12-03')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Clear Departure' }));
    expect(screen.getByRole('button', { name: 'Departure, not set' })).toBeOnTheScreen();
  });

  it('opens the Android date dialog on Android', () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
    render(<Reply content={FORM} />);
    fireEvent.press(screen.getByRole('button', { name: 'Departure, not set' }));
    expect(mockAndroidOpen).toHaveBeenCalledWith(expect.objectContaining({ mode: 'date' }));
    act(() => mockAndroidOpen.mock.calls[0]![0].onValueChange({}, new Date(2026, 0, 9, 12)));
    expect(screen.queryByRole('button', { name: 'Departure, not set' })).toBeNull();
  });

  it('announces required fields as required instead of reading an asterisk', () => {
    render(<Reply content={FORM} />);
    expect(screen.getByLabelText('Name, required')).toBeOnTheScreen();
    expect(screen.queryByText('Name *')).toBeNull();
    expect(screen.getByText('Name *', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('moves focus to the first invalid field after a failed Apply', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    render(<Reply content={FORM} />);
    fireEvent.press(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByTestId('answer-form-error-0')).toBeOnTheScreen();
    expect(screen.getByTestId('answer-form-error-2')).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce.mock.calls[0]![1]).toBe('focus');
    const target = announce.mock.calls[0]![0] as unknown as { props: { testID?: string } };
    expect(target.props.testID).toBe('answer-form-error-0');
  });

  it('keeps typed values when the row is recycled, only for the same message', () => {
    const view = render(<Reply content={FORM} messageId="message-1" />);
    fireEvent.changeText(screen.getByLabelText('Name, required'), 'Ada');
    view.unmount();
    const again = render(<Reply content={FORM} messageId="message-1" />);
    expect(screen.getByLabelText('Name, required')).toHaveDisplayValue('Ada');
    again.rerender(<Reply content={FORM} messageId="message-2" />);
    expect(screen.getByLabelText('Name, required')).toHaveDisplayValue('');
  });

  it('reports typed values as unsaved until they go back to the start', () => {
    render(<Reply content={FORM} messageId="message-1" />);
    expect(hasUnsavedAnswerEdits('message-1')).toBe(false);
    fireEvent.changeText(screen.getByLabelText('Name, required'), 'Ada');
    expect(hasUnsavedAnswerEdits('message-1')).toBe(true);
    expect(hasUnsavedAnswerEdits('message-2')).toBe(false);
    fireEvent.changeText(screen.getByLabelText('Name, required'), '');
    expect(hasUnsavedAnswerEdits('message-1')).toBe(false);
  });

  it('counts applied values as the new start', () => {
    render(<Reply content={FORM} messageId="message-1" />);
    fireEvent.changeText(screen.getByLabelText('Name, required'), 'Ada');
    fireEvent.press(screen.getByRole('button', { name: 'Meal, required, Choose an option' }));
    fireEvent.press(screen.getByRole('radio', { name: 'Fish' }));
    expect(hasUnsavedAnswerEdits('message-1')).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Apply' }));
    expect(hasUnsavedAnswerEdits('message-1')).toBe(false);
    fireEvent.changeText(screen.getByLabelText('Name, required'), 'Grace');
    expect(hasUnsavedAnswerEdits('message-1')).toBe(true);
  });
});

type MeasureDone = (x: number, y: number, width: number, height: number) => void;
type Measured = { props: { testID?: string } };
const MockedView = jest.requireMock<{
  default: { prototype: { measureInWindow: (this: Measured, done: MeasureDone) => void } };
}>('react-native/Libraries/Components/View/View').default;

function ScrolledReply({ list, onReveal }: { list: ScrollableChatList; onReveal: () => void }) {
  const viewport = useRef<View>(null);
  const listRef = useRef<ScrollableChatList>(list);
  return (
    <View ref={viewport} testID="chat-viewport">
      <ChatScrollIntoView list={listRef} viewport={viewport} onReveal={onReveal}>
        <Reply content={FORM} />
      </ChatScrollIntoView>
    </View>
  );
}

describe('scrolling a failed form into view', () => {
  function placeViews(fieldY: number) {
    jest.spyOn(MockedView.prototype, 'measureInWindow').mockImplementation(function measure(
      this: Measured,
      done: MeasureDone,
    ) {
      if (this.props.testID === 'chat-viewport') done(0, 100, 320, 600);
      else if (this.props.testID === 'answer-form-field-2') done(0, fieldY, 320, 60);
      else done(0, 0, 0, 0);
    });
  }

  it('scrolls the chat to the first invalid field when it is off screen', () => {
    placeViews(900);
    const list = { getAbsoluteLastScrollOffset: () => 400, scrollToOffset: jest.fn() };
    const onReveal = jest.fn();
    render(<ScrolledReply list={list} onReveal={onReveal} />);
    fireEvent.changeText(screen.getByLabelText('Name, required'), 'Ada');
    fireEvent.press(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByTestId('answer-form-error-2')).toBeOnTheScreen();
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(list.scrollToOffset).toHaveBeenCalledWith({
      offset: 1184,
      animated: true,
      skipFirstItemOffset: true,
    });
  });

  it('leaves the chat where it is when the field is already on screen', () => {
    placeViews(300);
    const list = { getAbsoluteLastScrollOffset: () => 400, scrollToOffset: jest.fn() };
    const onReveal = jest.fn();
    render(<ScrolledReply list={list} onReveal={onReveal} />);
    fireEvent.changeText(screen.getByLabelText('Name, required'), 'Ada');
    fireEvent.press(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByTestId('answer-form-error-2')).toBeOnTheScreen();
    expect(onReveal).not.toHaveBeenCalled();
    expect(list.scrollToOffset).not.toHaveBeenCalled();
  });

  it('works out the offset that brings a field to the top of the chat', () => {
    const frame = { targetHeight: 60, viewportY: 100, viewportHeight: 600, currentOffset: 400 };
    expect(chatRevealOffset({ ...frame, targetY: 900 }, 16)).toBe(1184);
    expect(chatRevealOffset({ ...frame, targetY: 20 }, 16)).toBe(304);
    expect(chatRevealOffset({ ...frame, targetY: 300 }, 16)).toBeNull();
    expect(chatRevealOffset({ ...frame, targetY: 20, currentOffset: 0 }, 16)).toBe(0);
  });
});

function clarifyCard(cardId: string): { card: InteractiveCard; body: ClarifyCardBody } {
  const body: ClarifyCardBody = {
    questions: [
      {
        id: 'q1',
        header: 'City',
        question: 'Which city?',
        options: [
          { id: 'a', label: 'Paris', description: '' },
          { id: 'b', label: 'Rome', description: '' },
        ],
        multiSelect: false,
        isOther: true,
        isSecret: false,
      },
    ],
    state: { status: 'pending' },
  } as ClarifyCardBody;
  const card = {
    schemaVersion: 1,
    cardId,
    createdAt: '2026-11-14T00:00:00.000Z',
    fallback: { headline: 'A few questions', text: 'Answer below' },
    producedBy: { toolCallId: 'call-1', toolName: 'clarify' },
    recognized: true,
    kind: 'clarify.v1',
    body,
  } as InteractiveCard;
  return { card, body };
}

describe('clarifying questions', () => {
  it('keeps a selection when the row is recycled, and not on a different card', () => {
    const first = clarifyCard('card-1');
    const onRespond = jest.fn(async () => true);
    const view = render(
      <ClarifyCard card={first.card} body={first.body} canRespond onRespond={onRespond} />,
    );
    fireEvent.press(screen.getByRole('radio', { name: 'Rome' }));
    expect(screen.getByRole('radio', { name: 'Rome' })).toBeChecked();
    view.unmount();

    const again = render(
      <ClarifyCard card={first.card} body={first.body} canRespond onRespond={onRespond} />,
    );
    expect(screen.getByRole('radio', { name: 'Rome' })).toBeChecked();

    const second = clarifyCard('card-2');
    again.rerender(
      <ClarifyCard card={second.card} body={second.body} canRespond onRespond={onRespond} />,
    );
    expect(screen.getByRole('radio', { name: 'Rome' })).not.toBeChecked();
  });
});
