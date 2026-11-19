import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { View as MockView } from 'react-native';
import type {
  AnswerUiBlock,
  AnswerUiCardBody,
  ClarifyCardBody,
  InteractiveCard,
} from '@agiworkforce/types';

const mockSlider = jest.fn();

jest.mock('expo-image', () => ({ Image: () => null }));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('@/services/authSession', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({})),
}));

jest.mock('@/services/api', () => ({
  api: { post: jest.fn() },
  apiFetch: jest.fn(),
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: 'owner', epoch: 1 }),
  isCloudAccountEpochCurrent: () => true,
}));

jest.mock('../ReportChart', () => ({
  ReportChart: () => null,
  chartSeriesColor: (_colors: unknown, index: number) => String(index),
}));

jest.mock('../MarkdownImage', () => ({
  MarkdownImage: () => null,
  InlineMarkdownImage: () => null,
}));

jest.mock('../MessageContentRenderer', () => ({
  renderMarkdownContent: () => [],
}));

jest.mock('@react-native-community/slider', () => (props: Record<string, unknown>) => {
  mockSlider(props);
  return <MockView testID={props.testID as string} />;
});

jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn() },
}));

import { InteractiveCardBlock } from '../InteractiveCardBlock';
import { ClarifyCard } from '../ClarifyCard';
import { hasUnsavedAnswerEdits } from '../AssistantDraftScope';
import { clearAnswerDrafts } from '../answerDraftStore';
import { answerUiValuesChanged } from '../cards/answer-ui';

const CONVERSATION_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const MESSAGE_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a6c';

const SLIDER: AnswerUiBlock = {
  type: 'slider',
  id: 'rent',
  label: 'Rent',
  min: 0,
  max: 3000,
  step: 50,
  value: 1200,
};

function answerUiCard(blocks: AnswerUiBlock[]): InteractiveCard {
  const body: AnswerUiCardBody = { title: 'Plan your budget', blocks };
  return {
    schemaVersion: 1,
    cardId: 'answer-ui-card',
    createdAt: '2026-11-14T12:00:00.000Z',
    fallback: { headline: 'Budget planner', text: 'A budget planner.' },
    producedBy: { toolCallId: 'ui-call', toolName: 'render_answer_ui' },
    recognized: true,
    kind: 'answer-ui.v1',
    body,
  } as InteractiveCard;
}

function clarifyCard(status: ClarifyCardBody['state'] = { status: 'pending' }): {
  card: InteractiveCard;
  body: ClarifyCardBody;
} {
  const body = {
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
    state: status,
  } as ClarifyCardBody;
  const card = {
    schemaVersion: 1,
    cardId: 'clarify-card',
    createdAt: '2026-11-14T00:00:00.000Z',
    fallback: { headline: 'A few questions', text: 'Answer below' },
    producedBy: { toolCallId: 'call-1', toolName: 'clarify' },
    recognized: true,
    kind: 'clarify.v1',
    body,
  } as InteractiveCard;
  return { card, body };
}

function renderBlock(cards: InteractiveCard[], onRespond?: () => Promise<boolean>) {
  return render(
    <InteractiveCardBlock
      cards={cards}
      tileBaseUrl="https://app.agi.example/"
      canLoadManagedCloudTiles
      canRespond
      messageId={MESSAGE_ID}
      conversationId={CONVERSATION_ID}
      {...(onRespond ? { onRespond } : {})}
    />,
  );
}

function moveSlider(value: number) {
  act(() => (mockSlider.mock.calls.at(-1)![0].onValueChange as (next: number) => void)(value));
}

describe('answer cards report unsaved values so Regenerate and Edit ask first', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAnswerDrafts();
  });

  it('compares answer-ui values by content, ignoring the order of picked choices', () => {
    expect(
      answerUiValuesChanged({ rent: 1200, extras: ['gym'] }, { rent: 1200, extras: ['gym'] }),
    ).toBe(false);
    expect(answerUiValuesChanged({ extras: ['gym', 'pool'] }, { extras: ['pool', 'gym'] })).toBe(
      false,
    );
    expect(answerUiValuesChanged({ rent: 1200 }, { rent: 1500 })).toBe(true);
    expect(answerUiValuesChanged({ extras: [] }, { extras: ['gym'] })).toBe(true);
    expect(answerUiValuesChanged({ name: '' }, { name: '', city: 'Rome' })).toBe(true);
  });

  it('marks an answer-ui card while a control differs from its starting value, across a recycled row', () => {
    const view = renderBlock([answerUiCard([SLIDER])]);
    expect(hasUnsavedAnswerEdits(MESSAGE_ID)).toBe(false);

    moveSlider(1500);
    expect(hasUnsavedAnswerEdits(MESSAGE_ID)).toBe(true);
    expect(hasUnsavedAnswerEdits('another-message')).toBe(false);

    view.unmount();
    expect(hasUnsavedAnswerEdits(MESSAGE_ID)).toBe(true);

    renderBlock([answerUiCard([SLIDER])]);
    moveSlider(1200);
    expect(hasUnsavedAnswerEdits(MESSAGE_ID)).toBe(false);
  });

  it('marks a pending clarify card once an answer is picked and clears it when the pick is undone', () => {
    const { card } = clarifyCard();
    renderBlock([card], async () => true);
    expect(hasUnsavedAnswerEdits(MESSAGE_ID)).toBe(false);

    fireEvent.press(screen.getByRole('radio', { name: 'Rome' }));
    expect(hasUnsavedAnswerEdits(MESSAGE_ID)).toBe(true);

    fireEvent.press(screen.getByRole('radio', { name: 'Rome' }));
    expect(hasUnsavedAnswerEdits(MESSAGE_ID)).toBe(false);

    fireEvent.changeText(screen.getByLabelText('Other answer for City'), 'Lisbon');
    expect(hasUnsavedAnswerEdits(MESSAGE_ID)).toBe(true);
  });

  it('stops asking once the clarify answers are sent, and asks again when the send fails', async () => {
    const { card, body } = clarifyCard();
    const onRespond = jest.fn<Promise<boolean>, []>(async () => false);
    const view = render(
      <ClarifyCard
        card={card}
        body={body}
        canRespond
        onRespond={onRespond}
        messageId={MESSAGE_ID}
      />,
    );
    fireEvent.press(screen.getByRole('radio', { name: 'Paris' }));
    fireEvent.press(screen.getByTestId('clarify-send-answers'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(hasUnsavedAnswerEdits(MESSAGE_ID)).toBe(true);

    onRespond.mockImplementation(async () => true);
    fireEvent.press(screen.getByTestId('clarify-send-answers'));
    await waitFor(() => expect(hasUnsavedAnswerEdits(MESSAGE_ID)).toBe(false));

    const answered = clarifyCard({
      status: 'answered',
      answers: [{ questionId: 'q1', kind: 'options', optionIds: ['a'], labels: ['Paris'] }],
      answeredAt: '2026-11-14T00:01:00.000Z',
    });
    view.rerender(
      <ClarifyCard
        card={answered.card}
        body={answered.body}
        canRespond
        onRespond={onRespond}
        messageId={MESSAGE_ID}
      />,
    );
    expect(hasUnsavedAnswerEdits(MESSAGE_ID)).toBe(false);
  });
});
