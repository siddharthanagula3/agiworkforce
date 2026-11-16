import { isValidElement, useRef, type ReactNode } from 'react';
import { Keyboard, TextInput, View } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { InteractiveCard, ClarifyCardBody } from '@agiworkforce/types';
import type { ToolApprovalReview } from '@agiworkforce/cloud-contracts';
import { renderMarkdownContent } from '@/src/features/chat/components/MessageContentRenderer';
import { ClarifyCard } from '@/src/features/chat/components/ClarifyCard';
import { CloudToolApprovalControls } from '@/src/features/chat/components/CloudToolApprovalControls';
import { ResearchPlanOptions } from '@/src/features/chat/components/research/ResearchPlanOptions';
import { ResearchRunCard } from '@/src/features/chat/components/research/ResearchRunCard';
import {
  reduceResearchDelta,
  type ResearchRunState,
} from '@/src/features/chat/utils/researchRunState';
import type { StreamDelta } from '@/services/streaming';
import { clearAnswerDrafts } from '@/src/features/chat/components/answerDraftStore';
import {
  ChatScrollIntoView,
  chatRevealOffset,
  ChatScrollIntoViewReset,
  useRevealFocusedField,
  type ScrollableChatList,
} from '@/src/features/chat/components/cards/ChatScrollIntoView';
import { defaultResearchPlanChoices } from '@/src/features/chat/utils/researchPlanChoices';
import { lightColors } from '@/src/ui/theme/tokens';

jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('@/services/connectors', () => ({
  fetchConnectorDirectory: () => Promise.resolve({ connectors: [] }),
}));

type MeasureDone = (x: number, y: number, width: number, height: number) => void;
type MeasuredProps = {
  testID?: string;
  accessibilityLabel?: string;
  collapsable?: boolean;
  children?: ReactNode;
};
type Measured = { props: MeasuredProps };
const MockedView = jest.requireMock<{
  default: { prototype: { measureInWindow: (this: Measured, done: MeasureDone) => void } };
}>('react-native/Libraries/Components/View/View').default;

const VIEWPORT = { y: 100, height: 600 };
const FIELD = { y: 900, height: 60 };
const START_OFFSET = 400 + FIELD.y - VIEWPORT.y - 16;
const END_OFFSET = 400 + FIELD.y + FIELD.height - VIEWPORT.y - VIEWPORT.height + 16;

const OUT_OF_THE_WAY = { y: 300, height: 20 };

let keyboardShown = false;
let showListeners: Array<() => void> = [];
let frames = new Map<number, () => void>();
let nextFrame = 1;
let isRevealTarget: (props: MeasuredProps) => boolean = () => false;

function showsElement(node: ReactNode, wanted: (props: MeasuredProps) => boolean): boolean {
  if (Array.isArray(node)) return node.some((child) => showsElement(child, wanted));
  if (!isValidElement<MeasuredProps>(node)) return false;
  return wanted(node.props) || showsElement(node.props.children, wanted);
}

function containsLabels(props: MeasuredProps, ...labels: string[]): boolean {
  return (
    props.collapsable === false &&
    labels.every((label) =>
      showsElement(
        props.children,
        (child) => child.accessibilityLabel === label || child.testID === label,
      ),
    )
  );
}

function stepFrames() {
  const due = [...frames.entries()];
  frames = new Map();
  act(() => due.forEach(([, callback]) => callback()));
}

function flushFrames() {
  while (frames.size > 0) stepFrames();
}

function showKeyboard() {
  keyboardShown = true;
  const pending = [...showListeners];
  act(() => pending.forEach((listener) => listener()));
}

function raiseKeyboard() {
  showKeyboard();
  flushFrames();
}

function Thread({ list, children }: { list: ScrollableChatList; children: ReactNode }) {
  const viewport = useRef<View>(null);
  const listRef = useRef<ScrollableChatList>(list);
  return (
    <View ref={viewport} testID="chat-viewport">
      <ChatScrollIntoView list={listRef} viewport={viewport}>
        {children}
      </ChatScrollIntoView>
    </View>
  );
}

function makeList() {
  return { getAbsoluteLastScrollOffset: () => 400, scrollToOffset: jest.fn() };
}

function renderInThread(children: ReactNode) {
  const list = makeList();
  render(<Thread list={list}>{children}</Thread>);
  return list;
}

function scrolled(offset: number) {
  return { offset, animated: true, skipFirstItemOffset: true };
}

beforeEach(() => {
  keyboardShown = false;
  showListeners = [];
  frames = new Map();
  nextFrame = 1;
  isRevealTarget = (props) => props.testID === 'field-container';
  jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextFrame++;
    frames.set(id, () => callback(0));
    return id;
  });
  jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
  jest.spyOn(Keyboard, 'isVisible').mockImplementation(() => keyboardShown);
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, listener: () => void) => {
    if (event === 'keyboardDidShow') showListeners.push(listener);
    return {
      remove: () => {
        showListeners = showListeners.filter((entry) => entry !== listener);
      },
    };
  }) as never);
  jest.spyOn(MockedView.prototype, 'measureInWindow').mockImplementation(function measure(
    this: Measured,
    done: MeasureDone,
  ) {
    if (this.props.testID === 'chat-viewport') done(0, VIEWPORT.y, 320, VIEWPORT.height);
    else if (isRevealTarget(this.props)) done(0, FIELD.y, 320, FIELD.height);
    else done(0, OUT_OF_THE_WAY.y, 320, OUT_OF_THE_WAY.height);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => clearAnswerDrafts());
});

function Field({ edge }: { edge?: 'start' | 'end' }) {
  const container = useRef<View>(null);
  const reveal = useRevealFocusedField(container, edge);
  return (
    <View ref={container} collapsable={false} testID="field-container">
      <TextInput
        testID="field"
        multiline
        onFocus={reveal.onFocus}
        onBlur={reveal.onBlur}
        onContentSizeChange={reveal.onContentSizeChange}
      />
    </View>
  );
}

describe('useRevealFocusedField', () => {
  it('waits for the keyboard to show, then scrolls the field above it, once', () => {
    const list = renderInThread(<Field />);
    fireEvent(screen.getByTestId('field'), 'focus');
    expect(list.scrollToOffset).not.toHaveBeenCalled();

    raiseKeyboard();
    expect(list.scrollToOffset).toHaveBeenCalledTimes(1);
    expect(list.scrollToOffset).toHaveBeenCalledWith(scrolled(START_OFFSET));
    expect(showListeners).toHaveLength(0);
  });

  it('waits two frames after the keyboard shows, so the screen has padded the list first', () => {
    const list = renderInThread(<Field />);
    fireEvent(screen.getByTestId('field'), 'focus');
    showKeyboard();
    expect(list.scrollToOffset).not.toHaveBeenCalled();
    stepFrames();
    expect(list.scrollToOffset).not.toHaveBeenCalled();
    stepFrames();
    expect(list.scrollToOffset).toHaveBeenCalledWith(scrolled(START_OFFSET));
  });

  it('drops the reveal when the field loses focus before the frames run', () => {
    const list = renderInThread(<Field />);
    const field = screen.getByTestId('field');
    fireEvent(field, 'focus');
    showKeyboard();
    fireEvent(field, 'blur');
    flushFrames();
    expect(list.scrollToOffset).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it('cancels a waiting frame when the field goes away', () => {
    const list = makeList();
    const view = render(
      <Thread list={list}>
        <Field />
      </Thread>,
    );
    fireEvent(screen.getByTestId('field'), 'focus');
    showKeyboard();
    expect(frames.size).toBe(1);
    view.unmount();
    expect(frames.size).toBe(0);
  });

  it('scrolls at once when the keyboard is already up', () => {
    keyboardShown = true;
    const list = renderInThread(<Field />);
    fireEvent(screen.getByTestId('field'), 'focus');
    expect(list.scrollToOffset).toHaveBeenCalledWith(scrolled(START_OFFSET));
    expect(showListeners).toHaveLength(0);
  });

  it('scrolls again while the field grows, and stops after it loses focus', () => {
    keyboardShown = true;
    const list = renderInThread(<Field />);
    const field = screen.getByTestId('field');
    fireEvent(field, 'focus');
    list.scrollToOffset.mockClear();

    fireEvent(field, 'contentSizeChange', { nativeEvent: { contentSize: { height: 120 } } });
    expect(list.scrollToOffset).toHaveBeenCalledTimes(1);

    fireEvent(field, 'blur');
    list.scrollToOffset.mockClear();
    fireEvent(field, 'contentSizeChange', { nativeEvent: { contentSize: { height: 160 } } });
    expect(list.scrollToOffset).not.toHaveBeenCalled();
  });

  it('does not move the list when the field loses focus or the keyboard shows after the blur', () => {
    const list = renderInThread(<Field />);
    const field = screen.getByTestId('field');
    fireEvent(field, 'focus');
    fireEvent(field, 'blur');
    expect(showListeners).toHaveLength(0);
    raiseKeyboard();
    expect(list.scrollToOffset).not.toHaveBeenCalled();
  });

  it('does not grow the list of keyboard listeners across repeated focus', () => {
    renderInThread(<Field />);
    const field = screen.getByTestId('field');
    fireEvent(field, 'focus');
    fireEvent(field, 'focus');
    expect(showListeners).toHaveLength(1);
  });

  it('removes its keyboard listener when the field goes away', () => {
    const list = makeList();
    const view = render(
      <Thread list={list}>
        <Field />
      </Thread>,
    );
    fireEvent(screen.getByTestId('field'), 'focus');
    expect(showListeners).toHaveLength(1);
    view.unmount();
    expect(showListeners).toHaveLength(0);
  });

  it('keeps the bottom edge of a tall field above the keyboard when asked for the end', () => {
    keyboardShown = true;
    const list = renderInThread(<Field edge="end" />);
    fireEvent(screen.getByTestId('field'), 'focus');
    expect(list.scrollToOffset).toHaveBeenCalledWith(scrolled(END_OFFSET));
  });

  it('does nothing inside a reset, such as a full-screen modal over the thread', () => {
    keyboardShown = true;
    const list = renderInThread(
      <ChatScrollIntoViewReset>
        <Field />
      </ChatScrollIntoViewReset>,
    );
    fireEvent(screen.getByTestId('field'), 'focus');
    expect(list.scrollToOffset).not.toHaveBeenCalled();
    expect(showListeners).toHaveLength(0);
  });

  it('does nothing outside a chat thread', () => {
    keyboardShown = true;
    render(<Field />);
    expect(() => fireEvent(screen.getByTestId('field'), 'focus')).not.toThrow();
    expect(showListeners).toHaveLength(0);
  });
});

describe('chatRevealOffset from the end', () => {
  const frame = {
    targetY: 900,
    targetHeight: 60,
    viewportY: 100,
    viewportHeight: 600,
    currentOffset: 400,
  };

  it('lines the target bottom up with the viewport bottom, and keeps start alignment otherwise', () => {
    expect(chatRevealOffset(frame, 16, 'end')).toBe(END_OFFSET);
    expect(chatRevealOffset(frame, 16)).toBe(START_OFFSET);
    expect(chatRevealOffset({ ...frame, targetY: 300 }, 16, 'end')).toBeNull();
    expect(chatRevealOffset({ ...frame, targetY: 20 }, 16, 'end')).toBe(304);
  });

  it('leaves a field taller than the viewport alone while its bottom is in view', () => {
    const tall = {
      targetY: -200,
      targetHeight: 584,
      viewportY: 100,
      viewportHeight: 300,
      currentOffset: 1000,
    };
    expect(chatRevealOffset(tall, 16, 'end')).toBeNull();
    expect(chatRevealOffset({ ...tall, targetY: -300 }, 16, 'end')).toBeNull();
    expect(chatRevealOffset({ ...tall, targetY: -500, targetHeight: 100 }, 16, 'end')).toBe(384);
    expect(chatRevealOffset({ ...tall, targetY: 0 }, 16, 'end')).toBe(
      1000 + 0 + 584 - 100 - 300 + 16,
    );
  });
});

describe('fields in the thread reveal themselves on focus', () => {
  it('reveals the tool approval guidance field with its Allow and Deny row', () => {
    keyboardShown = true;
    const review: ToolApprovalReview = {
      riskTier: 'medium',
      destructive: false,
      scopes: ['once'],
    };
    isRevealTarget = (props) =>
      containsLabels(props, 'Guidance for Create Issue', 'Decision for Create Issue');
    const list = renderInThread(
      <CloudToolApprovalControls
        toolCallId="call_1"
        toolName="mcp__github__create_issue"
        summary="Create Issue"
        args={{ repo: 'agi/web' }}
        review={review}
        onResolve={jest.fn()}
        onAllowForChat={jest.fn()}
        onAlwaysAllow={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByLabelText('Add guidance for Create Issue'));
    fireEvent(screen.getByLabelText('Guidance for Create Issue'), 'focus');
    expect(list.scrollToOffset).toHaveBeenCalledWith(scrolled(START_OFFSET));
  });

  it('reveals a form field and its label when it gains focus', () => {
    keyboardShown = true;
    const form = '```form\ntitle: Trip\ntext: Name *\nsubmit: Apply\n```';
    isRevealTarget = (props) => props.testID === 'answer-form-field-0';
    const list = renderInThread(<View>{renderMarkdownContent(form, lightColors)}</View>);
    fireEvent(screen.getByLabelText('Name, required'), 'focus');
    expect(list.scrollToOffset).toHaveBeenCalledWith(scrolled(START_OFFSET));
  });

  it('keeps the bottom of a long answer field above the keyboard as it grows', () => {
    keyboardShown = true;
    const form = '```form\ntitle: Trip\ntextarea: Notes\nsubmit: Apply\n```';
    isRevealTarget = (props) => props.testID === 'answer-form-field-0';
    const list = renderInThread(<View>{renderMarkdownContent(form, lightColors)}</View>);
    fireEvent(screen.getByLabelText('Notes'), 'focus');
    expect(list.scrollToOffset).toHaveBeenCalledWith(scrolled(END_OFFSET));
  });

  it('reveals the clarify card Other answer when it gains focus', () => {
    keyboardShown = true;
    const body = {
      questions: [
        {
          id: 'q1',
          header: 'City',
          question: 'Which city?',
          options: [{ id: 'a', label: 'Paris', description: '' }],
          multiSelect: false,
          isOther: true,
          isSecret: false,
        },
      ],
      state: { status: 'pending' },
    } as ClarifyCardBody;
    const card = {
      schemaVersion: 1,
      cardId: 'card-keyboard',
      createdAt: '2026-11-14T00:00:00.000Z',
      fallback: { headline: 'A few questions', text: 'Answer below' },
      producedBy: { toolCallId: 'call-1', toolName: 'clarify' },
      recognized: true,
      kind: 'clarify.v1',
      body,
    } as InteractiveCard;
    isRevealTarget = (props) => containsLabels(props, 'Other answer for City');
    const list = renderInThread(
      <ClarifyCard card={card} body={body} canRespond onRespond={jest.fn(async () => true)} />,
    );
    fireEvent(screen.getByLabelText('Other answer for City'), 'focus');
    expect(list.scrollToOffset).toHaveBeenCalledWith(scrolled(START_OFFSET));
  });

  it('reveals the email address fields, and the body from its bottom edge', () => {
    keyboardShown = true;
    const email = '```email\nTo: reader@example.com\nSubject: Review\n\nHello there\n```';
    const list = renderInThread(<View>{renderMarkdownContent(email, lightColors)}</View>);

    isRevealTarget = (props) => containsLabels(props, 'To');
    fireEvent(screen.getByLabelText('To'), 'focus');
    expect(list.scrollToOffset).toHaveBeenLastCalledWith(scrolled(START_OFFSET));

    isRevealTarget = (props) => containsLabels(props, 'Subject');
    fireEvent(screen.getByLabelText('Subject'), 'focus');
    expect(list.scrollToOffset).toHaveBeenLastCalledWith(scrolled(START_OFFSET));

    isRevealTarget = (props) => containsLabels(props, 'Message');
    fireEvent(screen.getByLabelText('Message'), 'focus');
    expect(list.scrollToOffset).toHaveBeenLastCalledWith(scrolled(END_OFFSET));
  });

  it('reveals the inline writing editor from its bottom edge', () => {
    keyboardShown = true;
    const writing = '```writing\nA draft that remains editable.\n```';
    isRevealTarget = (props) => containsLabels(props, 'Edit Writing');
    const list = renderInThread(<View>{renderMarkdownContent(writing, lightColors)}</View>);
    fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    fireEvent(screen.getByLabelText('Edit Writing'), 'focus');
    expect(list.scrollToOffset).toHaveBeenCalledWith(scrolled(END_OFFSET));
  });

  it('reveals the research plan site fields when they gain focus', () => {
    keyboardShown = true;
    isRevealTarget = (props) =>
      containsLabels(props, 'research-source-allow') ||
      containsLabels(props, 'research-source-deny');
    const list = renderInThread(
      <ResearchPlanOptions choices={defaultResearchPlanChoices()} onChange={jest.fn()} />,
    );
    fireEvent(screen.getByTestId('research-source-allow'), 'focus');
    expect(list.scrollToOffset).toHaveBeenLastCalledWith(scrolled(START_OFFSET));
    fireEvent(screen.getByTestId('research-source-deny'), 'focus');
    expect(list.scrollToOffset).toHaveBeenCalledTimes(2);
  });

  it('reveals the research plan step and question fields from their bottom edge', () => {
    keyboardShown = true;
    const deltas = [
      {
        x_research_status: {
          phase: 'planning',
          label: 'Planning research',
          iteration: 1,
          max_iterations: 6,
          searches: 0,
          max_searches: 12,
          sources: 0,
          elapsed_ms: 900,
        },
      },
      {
        x_research_plan: {
          steps: [{ id: 'step-1', type: 'search', description: 'Grid storage', status: 'pending' }],
          questions: ['Which region matters most?'],
        },
      },
      {
        x_research_status: {
          phase: 'awaiting_approval',
          label: 'Review the plan to start searching',
          iteration: 1,
          max_iterations: 6,
          searches: 0,
          max_searches: 12,
          sources: 0,
          elapsed_ms: 1400,
        },
      },
    ] as StreamDelta[];
    let research: ResearchRunState | undefined;
    for (const delta of deltas) {
      research = reduceResearchDelta(research, delta, '2026-11-16T00:00:00.000Z') ?? research;
    }
    const list = renderInThread(
      <ResearchRunCard research={research!} isStreaming={false} onPlanDecision={jest.fn()} />,
    );

    isRevealTarget = (props) => containsLabels(props, 'Step 1', 'Remove step 1');
    fireEvent(screen.getByLabelText('Step 1'), 'focus');
    expect(list.scrollToOffset).toHaveBeenLastCalledWith(scrolled(END_OFFSET));

    isRevealTarget = (props) => containsLabels(props, 'Which region matters most?');
    fireEvent(screen.getByLabelText('Which region matters most?'), 'focus');
    expect(list.scrollToOffset).toHaveBeenLastCalledWith(scrolled(END_OFFSET));
    expect(list.scrollToOffset).toHaveBeenCalledTimes(2);
  });
});
