import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { Alert, Share, StyleSheet, Text as MockText, View as MockView } from 'react-native';
import type { AnswerUiBlock, AnswerUiCardBody, InteractiveCard } from '@agiworkforce/types';
import {
  AnswerUiMessageResponseSchema,
  INTERACTIVE_CARD_RESPONSE_PATH,
} from '@agiworkforce/cloud-contracts';
import {
  ANSWER_UI_CHART_DATA_LABEL,
  ANSWER_UI_MAP_NOTE,
} from '@agiworkforce/unified-chat/answer-ui';

const mockApiPost = jest.fn();
const mockCopyToClipboard = jest.fn();
const mockOpenUntrustedUrl = jest.fn();
const mockReportChart = jest.fn();
const mockMarkdownImage = jest.fn();
const mockSlider = jest.fn();

jest.mock('expo-image', () => ({ Image: () => null }));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

jest.mock('@/services/authSession', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({})),
}));

jest.mock('@/services/api', () => ({
  api: { post: (...args: unknown[]) => mockApiPost(...args) },
  apiFetch: jest.fn(),
}));

jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: 'owner', epoch: 1 }),
  isCloudAccountEpochCurrent: () => true,
}));

jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: (...args: unknown[]) => mockCopyToClipboard(...args),
}));

jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: (...args: unknown[]) => mockOpenUntrustedUrl(...args),
}));

jest.mock('../ReportChart', () => ({
  ReportChart: (props: Record<string, unknown>) => {
    mockReportChart(props);
    return null;
  },
  chartSeriesColor: (_colors: unknown, index: number) => `series-${index}`,
}));

jest.mock('../MarkdownImage', () => ({
  MarkdownImage: (props: Record<string, unknown>) => {
    mockMarkdownImage(props);
    return null;
  },
  InlineMarkdownImage: () => null,
}));

jest.mock('../MessageContentRenderer', () => ({
  renderMarkdownContent: (source: string) => [<MockText key="md">{source}</MockText>],
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
import * as AnswerUiMapModule from '../cards/AnswerUiMap';
import { MOBILE_INTERACTIVE_CARD_CAPABILITY } from '../../utils/clarifyCard';
import { clearAnswerDrafts } from '../answerDraftStore';

const CONVERSATION_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const MESSAGE_ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a6c';

function answerUiCard(blocks: AnswerUiBlock[], title = 'Plan your budget'): InteractiveCard {
  const body: AnswerUiCardBody = { title, blocks };
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

function renderCard(
  blocks: AnswerUiBlock[],
  options: {
    onSendMessage?: (text: string) => void;
    canRespond?: boolean;
    conversationId?: string;
    cloud?: boolean;
  } = {},
) {
  return render(
    <InteractiveCardBlock
      cards={[answerUiCard(blocks)]}
      tileBaseUrl="https://app.agi.example/"
      canLoadManagedCloudTiles={options.cloud ?? true}
      canRespond={options.canRespond ?? true}
      messageId={MESSAGE_ID}
      conversationId={options.conversationId ?? CONVERSATION_ID}
      {...(options.onSendMessage ? { onSendMessage: options.onSendMessage } : {})}
    />,
  );
}

const SLIDER: AnswerUiBlock = {
  type: 'slider',
  id: 'rent',
  label: 'Rent',
  min: 0,
  max: 3000,
  step: 50,
  value: 1200,
  unit: '$',
  unitPosition: 'prefix',
  readout: 'Rent is {rent} a month',
};

describe('answer-ui cards on mobile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAnswerDrafts();
    mockCopyToClipboard.mockResolvedValue(true);
    mockOpenUntrustedUrl.mockResolvedValue(true);
  });

  it('tells the server it renders answer-ui cards', () => {
    expect(MOBILE_INTERACTIVE_CARD_CAPABILITY.supported).toContain('answer-ui.v1');
  });

  it('renders the card instead of the fallback headline', () => {
    const { getByTestId, getByText, queryByTestId } = renderCard([
      { type: 'heading', id: 'h', text: 'Monthly costs', level: 2 },
      { type: 'text', id: 't', markdown: 'Set **each** cost.' },
    ]);

    expect(getByTestId('interactive-card-answer-ui')).toBeTruthy();
    expect(queryByTestId('interactive-card-fallback')).toBeNull();
    expect(getByText('Plan your budget')).toBeTruthy();
    expect(getByText('Monthly costs')).toBeTruthy();
    expect(getByText('Set **each** cost.')).toBeTruthy();
  });

  it('moves a slider and updates its value, its readout and a readout block computed from it', () => {
    const { getByTestId, getByText } = renderCard([
      SLIDER,
      { type: 'readout', id: 'year', label: 'Per year', value: '${= rent * 12}' },
    ]);

    expect(getByTestId('answer-ui-slider-value')).toHaveTextContent('$1,200');
    expect(getByText('Rent is $1,200 a month')).toBeTruthy();
    expect(getByText('$14,400')).toBeTruthy();
    const slider = mockSlider.mock.calls.at(-1)![0];
    expect(slider).toMatchObject({ minimumValue: 0, maximumValue: 3000, step: 50, value: 1200 });

    act(() => (slider.onValueChange as (value: number) => void)(1500));
    expect(getByTestId('answer-ui-slider-value')).toHaveTextContent('$1,500');
    expect(getByText('Rent is $1,500 a month')).toBeTruthy();
    expect(getByText('$18,000')).toBeTruthy();
  });

  it('selects radio, checkbox and dropdown choices and reads them back', () => {
    const { getByLabelText, getByText } = renderCard([
      {
        type: 'choice',
        id: 'city',
        label: 'City',
        style: 'radio',
        options: [
          { id: 'a', label: 'Austin' },
          { id: 'b', label: 'Boston', description: 'Colder' },
        ],
        selected: ['a'],
        readout: 'You picked {city}',
      },
      {
        type: 'choice',
        id: 'extras',
        label: 'Extras',
        style: 'checkbox',
        options: [
          { id: 'gym', label: 'Gym' },
          { id: 'pool', label: 'Pool' },
        ],
        selected: [],
        readout: 'Extras: {extras}',
      },
      {
        type: 'choice',
        id: 'term',
        label: 'Lease',
        style: 'dropdown',
        options: [
          { id: 'six', label: '6 months' },
          { id: 'twelve', label: '12 months' },
        ],
        selected: [],
        readout: 'Lease: {term}',
      },
    ]);

    expect(getByText('You picked Austin')).toBeTruthy();
    fireEvent.press(getByLabelText('Boston, Colder'));
    expect(getByText('You picked Boston')).toBeTruthy();
    expect(getByLabelText('Boston, Colder')).toBeSelected();

    fireEvent.press(getByLabelText('Gym'));
    fireEvent.press(getByLabelText('Pool'));
    expect(getByText('Extras: Gym, Pool')).toBeTruthy();
    fireEvent.press(getByLabelText('Gym'));
    expect(getByText('Extras: Pool')).toBeTruthy();

    expect(getByText('Lease: none')).toBeTruthy();
    fireEvent.press(getByLabelText('Lease, Choose'));
    fireEvent.press(getByLabelText('12 months'));
    expect(getByText('Lease: 12 months')).toBeTruthy();
  });

  it('types into a text input and shows it in the readout', () => {
    const { getByLabelText, getByText } = renderCard([
      {
        type: 'input',
        id: 'name',
        label: 'Name',
        inputType: 'text',
        placeholder: 'Your name',
        value: '',
        readout: 'Hello {name}',
      },
    ]);

    expect(getByText('Hello not set')).toBeTruthy();
    fireEvent.changeText(getByLabelText('Name'), 'Ana');
    expect(getByText('Hello Ana')).toBeTruthy();
  });

  it('ticks a checklist, shows progress, copies the exact checklist text and resets it', async () => {
    const { getByLabelText, getByTestId } = renderCard([
      {
        type: 'checklist',
        id: 'pack',
        title: 'Packing',
        items: [
          { id: 'a', label: 'Passport', checked: true },
          { id: 'b', label: 'Charger', checked: false },
        ],
      },
    ]);

    expect(getByTestId('answer-ui-checklist-progress')).toHaveTextContent('1 of 2 done · 50%');
    fireEvent.press(getByLabelText('Charger'));
    expect(getByTestId('answer-ui-checklist-progress')).toHaveTextContent('2 of 2 done · 100%');

    await act(async () => {
      fireEvent.press(getByLabelText('Copy checklist'));
    });
    expect(mockCopyToClipboard).toHaveBeenCalledWith('Packing\n- [x] Passport\n- [x] Charger');
    await waitFor(() => expect(getByLabelText('Copied')).toBeTruthy());

    fireEvent.press(getByLabelText('Reset'));
    expect(getByTestId('answer-ui-checklist-progress')).toHaveTextContent('1 of 2 done · 50%');
  });

  it('copies a copy-ready block exactly, offers Share beside it, and shares when the clipboard refuses', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const { getByLabelText } = renderCard([
      {
        type: 'copy',
        id: 'msg',
        title: 'Reply',
        badge: 'Draft',
        text: 'Thanks, see you at 9.',
        buttonLabel: 'Copy reply',
      },
    ]);

    await act(async () => {
      fireEvent.press(getByLabelText('Copy reply'));
    });
    expect(mockCopyToClipboard).toHaveBeenCalledWith('Thanks, see you at 9.');
    expect(share).not.toHaveBeenCalled();

    fireEvent.press(getByLabelText('Share'));
    expect(share).toHaveBeenLastCalledWith({ message: 'Thanks, see you at 9.' });

    share.mockClear();
    mockCopyToClipboard.mockResolvedValue(false);
    await act(async () => {
      fireEvent.press(getByLabelText('Copied'));
    });
    expect(share).toHaveBeenCalledWith({ message: 'Thanks, see you at 9.' });
  });

  it('copies an action template filled with the current values and resets every control', async () => {
    const { getByLabelText, getByTestId } = renderCard([
      SLIDER,
      {
        type: 'actions',
        id: 'acts',
        buttons: [
          {
            id: 'cp',
            label: 'Copy summary',
            action: 'copy',
            template: 'Rent {rent}',
            primary: false,
          },
          { id: 'rs', label: 'Start over', action: 'reset', primary: false },
          {
            id: 'ln',
            label: 'Listing',
            action: 'link',
            url: 'https://homes.example/1',
            primary: false,
          },
        ],
      },
    ]);

    act(() => (mockSlider.mock.calls.at(-1)![0].onValueChange as (value: number) => void)(900));
    await act(async () => {
      fireEvent.press(getByLabelText('Copy summary'));
    });
    expect(mockCopyToClipboard).toHaveBeenCalledWith('Rent $900');

    fireEvent.press(getByLabelText('Start over'));
    expect(getByTestId('answer-ui-slider-value')).toHaveTextContent('$1,200');

    fireEvent.press(getByLabelText('Listing'));
    expect(mockOpenUntrustedUrl).toHaveBeenCalledWith('https://homes.example/1');
  });

  it('sends a send action through the card response route and posts the composed text', async () => {
    mockApiPost.mockResolvedValue({ ok: true, message: 'My rent is $1,200' });
    const onSendMessage = jest.fn();
    const { getByLabelText } = renderCard(
      [
        SLIDER,
        {
          type: 'actions',
          id: 'acts',
          buttons: [
            {
              id: 'go',
              label: 'Use this',
              action: 'send',
              template: 'My rent is {rent}',
              primary: true,
            },
          ],
        },
        { type: 'suggestions', id: 'sg', items: [{ id: 'more', text: 'Show cheaper areas' }] },
      ],
      { onSendMessage },
    );

    await act(async () => {
      fireEvent.press(getByLabelText('Use this'));
    });
    expect(mockApiPost).toHaveBeenCalledWith(
      '/api/interactive-cards/respond',
      {
        conversation_id: CONVERSATION_ID,
        message_id: MESSAGE_ID,
        card_id: 'answer-ui-card',
        response: { kind: 'message', action_id: 'go', values: { rent: 1200 } },
      },
      { accountEpoch: { ownerId: 'owner', epoch: 1 } },
    );
    expect(onSendMessage).toHaveBeenCalledWith('My rent is $1,200');

    mockApiPost.mockResolvedValue({ ok: true, message: 'Show cheaper areas' });
    await act(async () => {
      fireEvent.press(getByLabelText('Show cheaper areas'));
    });
    expect(mockApiPost.mock.calls.at(-1)![1]).toMatchObject({
      response: { kind: 'message', action_id: 'more' },
    });
    expect(onSendMessage).toHaveBeenLastCalledWith('Show cheaper areas');
  });

  it('keeps send controls disabled with the reason while the reply is still being written', () => {
    const { getByLabelText, getByText } = renderCard(
      [
        {
          type: 'actions',
          id: 'acts',
          buttons: [{ id: 'go', label: 'Use this', action: 'send', primary: true }],
        },
      ],
      { onSendMessage: jest.fn(), canRespond: false },
    );

    expect(getByLabelText('Use this')).toBeDisabled();
    expect(getByText('Available when the reply finishes.')).toBeTruthy();
    fireEvent.press(getByLabelText('Use this'));
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('says send buttons need a saved chat when the chat has no server id', () => {
    const { getByLabelText, getByText } = renderCard(
      [{ type: 'suggestions', id: 'sg', items: [{ id: 'more', text: 'Tell me more' }] }],
      { onSendMessage: jest.fn(), conversationId: 'local-temporary' },
    );

    expect(getByLabelText('Tell me more')).toBeDisabled();
    expect(getByText('Buttons that send a message work in saved chats.')).toBeTruthy();
  });

  it('shows no send control at all when nothing can send it, so no button is dead', () => {
    const { queryByLabelText, queryByTestId } = renderCard(
      [
        {
          type: 'actions',
          id: 'acts',
          buttons: [{ id: 'go', label: 'Use this', action: 'send', primary: true }],
        },
        { type: 'suggestions', id: 'sg', items: [{ id: 'more', text: 'Tell me more' }] },
      ],
      { cloud: false, onSendMessage: jest.fn() },
    );

    expect(queryByLabelText('Use this')).toBeNull();
    expect(queryByTestId('answer-ui-suggestions')).toBeNull();
  });

  it('alerts and stays usable when the server refuses the send', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockApiPost.mockRejectedValue(new Error('409'));
    const onSendMessage = jest.fn();
    const { getByLabelText } = renderCard(
      [{ type: 'suggestions', id: 'sg', items: [{ id: 'more', text: 'Tell me more' }] }],
      { onSendMessage },
    );

    await act(async () => {
      fireEvent.press(getByLabelText('Tell me more'));
    });
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      'Could not send',
      "Couldn't send that from the card. Type it in the message box instead.",
    );
    expect(getByLabelText('Tell me more')).not.toBeDisabled();
  });

  it('refuses a composed message that does not match the shared response contract', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockApiPost.mockResolvedValue({ ok: true, message: 'Tell me more', extra: 'injected' });
    const onSendMessage = jest.fn();
    const { getByLabelText } = renderCard(
      [{ type: 'suggestions', id: 'sg', items: [{ id: 'more', text: 'Tell me more' }] }],
      { onSendMessage },
    );

    await act(async () => {
      fireEvent.press(getByLabelText('Tell me more'));
    });
    expect(mockApiPost.mock.calls[0]![0]).toBe(INTERACTIVE_CARD_RESPONSE_PATH);
    expect(
      AnswerUiMessageResponseSchema.safeParse(await mockApiPost.mock.results[0]!.value).success,
    ).toBe(false);
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      'Could not send',
      "Couldn't send that from the card. Type it in the message box instead.",
    );
  });

  it('draws bar charts from slider-driven formulas and keeps them current', () => {
    renderCard([
      SLIDER,
      {
        type: 'chart',
        id: 'c',
        title: 'Costs',
        chart: 'bar',
        xLabel: 'Item',
        series: [
          {
            name: 'Monthly',
            points: [
              { x: 'Rent', y: '=rent' },
              { x: 'Food', y: 400 },
            ],
          },
        ],
      },
    ]);

    expect(mockReportChart.mock.calls.at(-1)![0].chart).toMatchObject({
      kind: 'xy',
      title: 'Costs',
      categories: ['Rent', 'Food'],
      series: [{ type: 'bar', name: 'Monthly', values: [1200, 400] }],
    });
    act(() => (mockSlider.mock.calls.at(-1)![0].onValueChange as (value: number) => void)(2000));
    expect(mockReportChart.mock.calls.at(-1)![0].chart.series[0].values).toEqual([2000, 400]);
  });

  it('draws pie charts through the report chart', () => {
    renderCard([
      {
        type: 'chart',
        id: 'p',
        title: 'Split',
        chart: 'pie',
        series: [
          {
            name: 'Share',
            points: [
              { x: 'A', y: 3 },
              { x: 'B', y: 1 },
            ],
          },
        ],
      },
    ]);

    expect(mockReportChart.mock.calls.at(-1)![0].chart).toMatchObject({
      kind: 'pie',
      slices: [
        { label: 'A', value: 3 },
        { label: 'B', value: 1 },
      ],
    });
  });

  it('draws a scatter chart at its x and y positions and redraws it from a slider', () => {
    const { getByTestId, getByText, getByLabelText, queryByTestId } = renderCard([
      SLIDER,
      {
        type: 'chart',
        id: 's',
        title: 'Spread',
        chart: 'scatter',
        xLabel: 'Height',
        yLabel: 'Weight',
        series: [
          {
            name: 'Adults',
            points: [
              { x: 100, y: 50 },
              { x: 200, y: '=rent / 12' },
            ],
          },
          {
            name: 'Teens',
            points: [
              { x: 150, y: 40 },
              { x: 'tall', y: 30 },
            ],
          },
        ],
      },
    ]);

    expect(mockReportChart).not.toHaveBeenCalled();
    const first = getByTestId('answer-ui-scatter-point-0-0');
    const second = getByTestId('answer-ui-scatter-point-0-1');
    expect(Number(second.props.cx)).toBeGreaterThan(Number(first.props.cx));
    expect(Number(second.props.cy)).toBeLessThan(Number(first.props.cy));
    expect(getByTestId('answer-ui-scatter-point-1-0')).toBeTruthy();
    const swatches = getByTestId('answer-ui-scatter-legend')
      .findAll((node) => typeof node.type === 'string' && node.props.style?.width !== undefined)
      .map((node) => StyleSheet.flatten(node.props.style).backgroundColor);
    expect(swatches).toEqual(['series-0', 'series-1']);
    expect(queryByTestId('answer-ui-scatter-point-1-1')).toBeNull();
    expect(within(getByTestId('answer-ui-scatter-legend')).getByText('Teens')).toBeTruthy();
    expect(
      getByLabelText('Scatter chart, Spread. Adults: 100, 50; 200, 100. Teens: 150, 40'),
    ).toBeTruthy();

    const before = Number(second.props.cy);
    act(() => (mockSlider.mock.calls.at(-1)![0].onValueChange as (value: number) => void)(300));
    expect(Number(getByTestId('answer-ui-scatter-point-0-1').props.cy)).toBeGreaterThan(before);

    const touched = getByTestId('answer-ui-scatter-point-1-0');
    fireEvent(getByTestId('answer-ui-scatter-touch'), 'responderGrant', {
      nativeEvent: { locationX: Number(touched.props.cx), locationY: Number(touched.props.cy) },
    });
    expect(getByTestId('answer-ui-scatter-readout')).toHaveTextContent(
      'Teens: Height 150, Weight 40',
    );

    expect(queryByTestId('answer-ui-chart-table')).toBeNull();
    fireEvent.press(getByText('Show data'));
    const table = within(getByTestId('answer-ui-chart-table'));
    expect(table.getByText('Height')).toBeTruthy();
    expect(table.getByText('tall')).toBeTruthy();
    expect(table.getByText('25')).toBeTruthy();
    expect(getByText('Hide data')).toBeTruthy();
  });

  it('shows the data table with a note when no scatter point can be drawn', () => {
    const { getByTestId, getByText, queryByText } = renderCard([
      {
        type: 'chart',
        id: 's',
        title: 'Spread',
        chart: 'scatter',
        series: [{ name: 'Labels', points: [{ x: 'a', y: 1 }] }],
      },
    ]);

    expect(
      getByText('This chart could not be drawn. The data table below has its values.'),
    ).toBeTruthy();
    expect(within(getByTestId('answer-ui-chart-table')).getByText('a')).toBeTruthy();
    expect(getByTestId('answer-ui-chart-table').props.accessibilityLabel).toBe(
      ANSWER_UI_CHART_DATA_LABEL,
    );
    expect(queryByText('Show data')).toBeNull();
  });

  it('renders tables, callouts, key values, status, steps, transcripts, files and galleries', () => {
    const { getByTestId, getByText, getByLabelText, getAllByText } = renderCard([
      {
        type: 'table',
        id: 'tb',
        caption: 'Plans',
        columns: ['Plan', 'Price'],
        rows: [['Basic', '$5']],
      },
      { type: 'callout', id: 'co', tone: 'warning', title: 'Heads up', markdown: 'Prices change.' },
      { type: 'keyvalue', id: 'kv', title: 'Summary', items: [{ label: 'Total', value: '' }] },
      {
        type: 'status',
        id: 'st',
        items: [{ id: 's1', label: 'Deploy', status: 'Live', tone: 'success', note: 'Since 9:00' }],
      },
      { type: 'steps', id: 'sp', items: [{ id: 'x', title: 'Sign up', text: 'Use email' }] },
      { type: 'transcript', id: 'tr', items: [{ time: '0:01', speaker: 'Ana', text: 'Hi' }] },
      {
        type: 'files',
        id: 'fl',
        items: [
          { id: 'f1', name: 'report.pdf', fileType: 'pdf', url: 'https://files.example/r.pdf' },
          { id: 'f2', name: 'sample.csv', fileType: 'csv' },
        ],
      },
      {
        type: 'gallery',
        id: 'gl',
        images: [{ url: 'https://img.example/a.png', alt: 'Kitchen', caption: 'After' }],
      },
    ]);

    expect(within(getByTestId('answer-ui-table')).getByText('Basic')).toBeTruthy();
    expect(getByText('Plans')).toBeTruthy();
    expect(getByTestId('answer-ui-callout-warning')).toBeTruthy();
    expect(getByText('Heads up')).toBeTruthy();
    expect(within(getByTestId('answer-ui-keyvalue')).getByText('-')).toBeTruthy();
    expect(getByText('Live')).toBeTruthy();
    expect(getByText('Since 9:00')).toBeTruthy();
    expect(getByText('Sign up')).toBeTruthy();
    expect(getByText('Use email')).toBeTruthy();
    expect(getByText('0:01')).toBeTruthy();
    expect(getAllByText('Example')).toHaveLength(1);
    fireEvent.press(getByLabelText('report.pdf'));
    expect(mockOpenUntrustedUrl).toHaveBeenCalledWith('https://files.example/r.pdf');
    expect(mockMarkdownImage.mock.calls.at(-1)![0]).toMatchObject({
      src: 'https://img.example/a.png',
      alt: 'Kitchen',
    });
    expect(getByText('After')).toBeTruthy();
  });

  it('opens and closes a disclosure and nests cards', () => {
    const { getByLabelText, queryByText, getByText } = renderCard([
      {
        type: 'disclosure',
        id: 'd',
        summary: 'Details',
        open: false,
        blocks: [
          {
            type: 'card',
            id: 'cd',
            title: 'Inner',
            badge: 'New',
            blocks: [{ type: 'text', id: 'in', markdown: 'Hidden text' }],
          },
        ],
      },
    ]);

    expect(queryByText('Hidden text')).toBeNull();
    fireEvent.press(getByLabelText('Details'));
    expect(getByText('Hidden text')).toBeTruthy();
    expect(getByText('New')).toBeTruthy();
    expect(getByLabelText('Details')).toBeExpanded();
  });

  it('lists map pins with a Maps link each and the approximate-pins note', () => {
    const { getAllByTestId, getByLabelText, getByText } = renderCard([
      {
        type: 'map',
        id: 'mp',
        title: 'Where to eat',
        pins: [
          {
            id: 'p1',
            label: 'Cafe One',
            latitude: 30.26,
            longitude: -97.74,
            note: 'Brunch',
            url: 'https://www.google.com/maps/search/?api=1&query=Cafe%20One',
          },
          {
            id: 'p2',
            label: 'Bean Two',
            latitude: 30.27,
            longitude: -97.73,
            url: 'https://www.google.com/maps/search/?api=1&query=Bean',
          },
        ],
      },
    ]);

    expect(getAllByTestId('answer-ui-map-pin')).toHaveLength(2);
    expect(getByText('Brunch')).toBeTruthy();
    fireEvent.press(getByLabelText('Open Cafe One in Maps'));
    expect(mockOpenUntrustedUrl).toHaveBeenCalledWith(
      'https://www.google.com/maps/search/?api=1&query=Cafe%20One',
    );
    expect(getByText('Pins are placed from the answer and can be approximate.')).toBeTruthy();
    expect(getByText(ANSWER_UI_MAP_NOTE)).toBeTruthy();
    expect(AnswerUiMapModule).not.toHaveProperty('ANSWER_UI_MAP_NOTE');
  });

  it('keeps what a person set when the row is recycled', () => {
    const first = renderCard([SLIDER]);
    act(() => (mockSlider.mock.calls.at(-1)![0].onValueChange as (value: number) => void)(700));
    first.unmount();

    const second = renderCard([SLIDER]);
    expect(second.getByTestId('answer-ui-slider-value')).toHaveTextContent('$700');
  });
});
