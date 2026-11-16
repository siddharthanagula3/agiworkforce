import React, { useRef } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';

const mockOpenUntrustedUrlInAppBrowser = jest.fn<Promise<boolean>, [unknown]>();

jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: (url: unknown) => mockOpenUntrustedUrlInAppBrowser(url),
}));

const mockPickerChange = jest.fn();
const mockPickerMode = jest.fn();
const mockAndroidOpen = jest.fn();
jest.mock('@react-native-community/datetimepicker', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: (props: {
      mode: string;
      testID?: string;
      onValueChange: (event: unknown, date: Date) => void;
    }) => {
      mockPickerMode(props.mode);
      mockPickerChange.mockImplementation((date: Date) => props.onValueChange({}, date));
      return <MockView testID={props.testID} />;
    },
    DateTimePickerAndroid: { open: (...args: unknown[]) => mockAndroidOpen(...args) },
  };
});

import { CloudRunInputForm } from '../components/CloudRunInputForm';
import { clearAnswerDrafts } from '@/src/features/chat/components/answerDraftStore';
import {
  ChatScrollIntoView,
  type ScrollableChatList,
} from '@/src/features/chat/components/cards/ChatScrollIntoView';

type PendingInput = NonNullable<CloudAgentRun['pendingInput']>;

const TOOL_NAME = 'mcp__github__create_issue';

const FORM_INPUT: PendingInput = {
  requestedAt: '2026-11-15T09:00:00.000Z',
  toolCalls: [
    {
      toolCallId: 'call_form',
      name: TOOL_NAME,
      connectorId: 'github',
      round: 0,
      inputRequests: {
        repo_prompt: {
          method: 'elicitation/create',
          params: {
            message: 'Which repository should I use?',
            requestedSchema: {
              type: 'object',
              properties: {
                repo: { type: 'string', title: 'Repository' },
                note: { type: 'string', title: 'Note' },
              },
              required: ['repo'],
            },
          },
        },
      },
    },
  ],
};

const LINK_INPUT: PendingInput = {
  requestedAt: '2026-11-15T09:05:00.000Z',
  toolCalls: [
    {
      toolCallId: 'call_link',
      name: TOOL_NAME,
      connectorId: 'github',
      round: 0,
      inputRequests: {
        sign_in: {
          method: 'elicitation/create',
          params: {
            mode: 'url',
            message: 'Sign in to finish connecting.',
            url: 'https://github.example/login/device',
          },
        },
      },
    },
  ],
};

function buttonDisabled(label: string): boolean | undefined {
  return screen.getByRole('button', { name: label }).props.accessibilityState?.disabled;
}

const DATE_INPUT: PendingInput = {
  requestedAt: '2026-11-15T09:20:00.000Z',
  toolCalls: [
    {
      toolCallId: 'call_dates',
      name: TOOL_NAME,
      connectorId: 'github',
      round: 0,
      inputRequests: {
        schedule: {
          method: 'elicitation/create',
          params: {
            message: 'When is it due?',
            requestedSchema: {
              type: 'object',
              properties: {
                due: { type: 'string', format: 'date', title: 'Due date' },
                remind: { type: 'string', format: 'date-time', title: 'Reminder' },
              },
              required: ['due'],
            },
          },
        },
      },
    },
  ],
};

const DUE = new Date(2026, 10, 20, 12);
const REMIND = new Date(2026, 10, 20, 9, 30);

function shownDay(date: Date): string {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function shownMoment(date: Date): string {
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

type MeasureDone = (x: number, y: number, width: number, height: number) => void;
type Measured = { props: { testID?: string; accessibilityLabel?: string } };
const MockedView = jest.requireMock<{
  default: { prototype: { measureInWindow: (this: Measured, done: MeasureDone) => void } };
}>('react-native/Libraries/Components/View/View').default;
const MockedTextInput = jest.requireMock<{
  default: { prototype: { focus: (this: Measured) => void } };
}>('react-native/Libraries/Components/TextInput/TextInput').default;

function ScrolledForm({
  list,
  pendingInput,
}: {
  list: ScrollableChatList;
  pendingInput: PendingInput;
}) {
  const viewport = useRef<View>(null);
  const listRef = useRef<ScrollableChatList>(list);
  return (
    <View ref={viewport} testID="chat-viewport">
      <ChatScrollIntoView list={listRef} viewport={viewport}>
        <CloudRunInputForm pendingInput={pendingInput} busy={false} onSubmit={jest.fn()} />
      </ChatScrollIntoView>
    </View>
  );
}

const originalOS = Platform.OS;

beforeEach(() => {
  clearAnswerDrafts();
  mockOpenUntrustedUrlInAppBrowser.mockReset();
  mockPickerChange.mockReset();
  mockPickerMode.mockReset();
  mockAndroidOpen.mockReset();
});

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
  jest.restoreAllMocks();
});

describe('CloudRunInputForm', () => {
  it('heads each request with the connector and the tool, and marks optional fields', () => {
    render(<CloudRunInputForm pendingInput={FORM_INPUT} busy={false} onSubmit={jest.fn()} />);

    expect(screen.getByText('GitHub needs your input')).toBeTruthy();
    expect(screen.queryByText('Github needs your input')).toBeNull();
    expect(screen.getByText('For Create Issue')).toBeTruthy();
    expect(screen.queryByText(TOOL_NAME)).toBeNull();
    expect(screen.getByText('Repository')).toBeTruthy();
    expect(screen.getByText('Note (optional)')).toBeTruthy();
  });

  it('names the connector by its catalog name, a custom one as Custom connector, and an unqualified tool by its id', () => {
    const [call] = FORM_INPUT.toolCalls;
    const input: PendingInput = {
      ...FORM_INPUT,
      toolCalls: [
        {
          ...call!,
          toolCallId: 'call_drive',
          name: 'mcp__google-drive__search',
          connectorId: 'google-drive',
        },
        {
          ...call!,
          toolCallId: 'call_hubspot',
          name: 'mcp__hubspot__find_contact',
          connectorId: 'hubspot',
        },
        {
          ...call!,
          toolCallId: 'call_custom',
          name: 'mcp__custom-7f3a__lookup',
          connectorId: 'custom-7f3a',
        },
        {
          ...call!,
          toolCallId: 'call_plain',
          name: 'lookup_account',
          connectorId: 'acme-crm',
        },
        {
          ...call!,
          toolCallId: 'call_unknown',
          name: 'lookup_account',
          connectorId: '',
        },
      ],
    };
    render(<CloudRunInputForm pendingInput={input} busy={false} onSubmit={jest.fn()} />);

    expect(screen.getAllByRole('header').map((header) => header.props.children)).toEqual([
      'Google Drive needs your input',
      'HubSpot needs your input',
      'Custom connector needs your input',
      'Acme Crm needs your input',
      'Needs your input',
    ]);
    expect(screen.getByText('For Find Contact')).toBeTruthy();
    expect(screen.getByText('For Lookup')).toBeTruthy();
  });

  it('keeps what was typed when the send fails and the form comes back', () => {
    const onSubmit = jest.fn();
    const first = render(
      <CloudRunInputForm pendingInput={FORM_INPUT} busy={false} onSubmit={onSubmit} />,
    );
    fireEvent.changeText(screen.getByLabelText('Repository'), 'acme/app');
    fireEvent.press(screen.getByRole('button', { name: 'Send answer' }));
    expect(onSubmit).toHaveBeenCalledWith([
      {
        toolCallId: 'call_form',
        responses: { repo_prompt: { action: 'accept', content: { repo: 'acme/app' } } },
      },
    ]);
    first.unmount();

    render(<CloudRunInputForm pendingInput={FORM_INPUT} busy={false} onSubmit={onSubmit} />);
    expect(screen.getByLabelText('Repository').props.value).toBe('acme/app');
  });

  it('cancels the request without answering it', () => {
    const onSubmit = jest.fn();
    render(<CloudRunInputForm pendingInput={FORM_INPUT} busy={false} onSubmit={onSubmit} />);

    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(onSubmit).toHaveBeenCalledWith([
      { toolCallId: 'call_form', responses: { repo_prompt: { action: 'cancel' } } },
    ]);
  });

  it('continues a link request only after the link opened in the in-app browser', async () => {
    const onSubmit = jest.fn();
    mockOpenUntrustedUrlInAppBrowser.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<CloudRunInputForm pendingInput={LINK_INPUT} busy={false} onSubmit={onSubmit} />);

    expect(screen.getByText('Open the link to continue.')).toBeTruthy();
    expect(buttonDisabled('Continue')).toBe(true);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Open github.example' }));
    });
    expect(mockOpenUntrustedUrlInAppBrowser).toHaveBeenLastCalledWith(
      'https://github.example/login/device',
    );
    expect(buttonDisabled('Continue')).toBe(true);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Open github.example' }));
    });
    expect(screen.getByText('Finish in the browser, then continue here.')).toBeTruthy();
    expect(buttonDisabled('Continue')).toBe(false);

    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onSubmit).toHaveBeenCalledWith([
      { toolCallId: 'call_link', responses: { sign_in: { action: 'accept' } } },
    ]);
  });

  it('shows an expired request with every control disabled', () => {
    render(<CloudRunInputForm pendingInput={LINK_INPUT} busy={false} outcome="expired" />);

    expect(screen.getByText('This request expired.')).toBeTruthy();
    expect(buttonDisabled('Open github.example')).toBe(true);
    expect(buttonDisabled('Continue')).toBe(true);
    expect(buttonDisabled('Decline')).toBe(true);
    expect(buttonDisabled('Cancel')).toBe(true);
    expect(screen.queryByText('Open the link to continue.')).toBeNull();
  });

  it('keeps every field of an expired request on screen, disabled, with the expiry under the buttons', () => {
    const onSubmit = jest.fn();
    render(
      <CloudRunInputForm
        pendingInput={FORM_INPUT}
        busy={false}
        outcome="expired"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByLabelText('Repository').props.editable).toBe(false);
    expect(screen.getByLabelText('Note').props.editable).toBe(false);
    expect(buttonDisabled('Send answer')).toBe(true);
    expect(buttonDisabled('Decline')).toBe(true);
    expect(buttonDisabled('Cancel')).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Send answer' }));
    fireEvent.press(screen.getByRole('button', { name: 'Decline' }));
    expect(onSubmit).not.toHaveBeenCalled();

    const note = screen.getByTestId('tool-input.expired-note');
    expect(note).toHaveTextContent('This request expired.');
    expect(note.props.accessibilityLiveRegion).toBe('polite');
    expect(screen.queryByText('This request is no longer active.')).toBeNull();
  });

  it('says why an answer could not be sent above the buttons and keeps what was typed', () => {
    const onSubmit = jest.fn();
    const first = render(
      <CloudRunInputForm pendingInput={FORM_INPUT} busy={false} onSubmit={onSubmit} />,
    );
    fireEvent.changeText(screen.getByLabelText('Repository'), 'acme/app');
    fireEvent.press(screen.getByRole('button', { name: 'Send answer' }));
    first.unmount();

    const sendError = 'Could not send your answer. Check your connection and try again.';
    const view = render(
      <CloudRunInputForm
        pendingInput={FORM_INPUT}
        busy={false}
        onSubmit={onSubmit}
        sendError={sendError}
      />,
    );
    const line = screen.getByTestId('tool-input.send-error');
    expect(line).toHaveTextContent(sendError);
    expect(line.props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByLabelText('Repository').props.value).toBe('acme/app');
    expect(buttonDisabled('Send answer')).toBe(false);

    view.rerender(<CloudRunInputForm pendingInput={FORM_INPUT} busy={false} onSubmit={onSubmit} />);
    expect(screen.queryByTestId('tool-input.send-error')).toBeNull();
    expect(screen.getByLabelText('Repository').props.value).toBe('acme/app');
  });

  it('announces a send error to VoiceOver as well as through the live region', () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    announce.mockClear();
    const sendError = 'Could not send your answer. Check your connection and try again.';
    const view = render(
      <CloudRunInputForm pendingInput={FORM_INPUT} busy={false} onSubmit={jest.fn()} />,
    );
    expect(announce).not.toHaveBeenCalled();

    view.rerender(
      <CloudRunInputForm
        pendingInput={FORM_INPUT}
        busy={false}
        onSubmit={jest.fn()}
        sendError={sendError}
      />,
    );
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(sendError);

    view.rerender(
      <CloudRunInputForm
        pendingInput={FORM_INPUT}
        busy={false}
        outcome="expired"
        sendError={sendError}
      />,
    );
    expect(announce).toHaveBeenCalledTimes(1);
    announce.mockRestore();
  });

  it('lists the submitted values read-only once the answer is sent', () => {
    const view = render(
      <CloudRunInputForm pendingInput={FORM_INPUT} busy={false} onSubmit={jest.fn()} />,
    );
    fireEvent.changeText(screen.getByLabelText('Repository'), 'acme/app');
    fireEvent.press(screen.getByRole('button', { name: 'Send answer' }));
    view.rerender(<CloudRunInputForm pendingInput={FORM_INPUT} busy={false} outcome="sent" />);

    expect(
      screen.getByText('Sent. The reply continues once every request in it is answered.'),
    ).toBeTruthy();
    const repository = screen.getByLabelText('Repository');
    expect(repository.props.value).toBe('acme/app');
    expect(repository.props.editable).toBe(false);
    expect(screen.queryByRole('button', { name: 'Send answer' })).toBeNull();
  });

  it('offers Not set on an optional single choice and shows every field description', () => {
    const onSubmit = jest.fn();
    const input: PendingInput = {
      requestedAt: '2026-11-15T09:10:00.000Z',
      toolCalls: [
        {
          toolCallId: 'call_choice',
          name: TOOL_NAME,
          connectorId: 'github',
          round: 0,
          inputRequests: {
            labels: {
              method: 'elicitation/create',
              params: {
                message: 'How should I file it?',
                requestedSchema: {
                  type: 'object',
                  properties: {
                    priority: {
                      type: 'string',
                      title: 'Priority',
                      description: 'Leave it unset to use the repository default.',
                      enum: ['high', 'low'],
                    },
                    notify: {
                      type: 'boolean',
                      title: 'Notify watchers',
                      description: 'Sends an email to everyone watching the repository.',
                    },
                  },
                },
              },
            },
          },
        },
      ],
    };
    render(<CloudRunInputForm pendingInput={input} busy={false} onSubmit={onSubmit} />);

    expect(screen.getByText('Leave it unset to use the repository default.')).toBeTruthy();
    expect(screen.getByText('Sends an email to everyone watching the repository.')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Not set' }).props.accessibilityState.checked).toBe(
      true,
    );

    fireEvent.press(screen.getByRole('radio', { name: 'high' }));
    fireEvent.press(screen.getByRole('radio', { name: 'Not set' }));
    fireEvent.press(screen.getByRole('button', { name: 'Send answer' }));

    const responses = onSubmit.mock.calls[0]?.[0]?.[0]?.responses;
    expect(responses.labels.action).toBe('accept');
    expect(responses.labels.content).not.toHaveProperty('priority');
  });

  it('lists no fields for a request that was declined', () => {
    const view = render(
      <CloudRunInputForm pendingInput={FORM_INPUT} busy={false} onSubmit={jest.fn()} />,
    );
    fireEvent.changeText(screen.getByLabelText('Repository'), 'typed then declined');
    fireEvent.press(screen.getByRole('button', { name: 'Decline' }));
    view.rerender(<CloudRunInputForm pendingInput={FORM_INPUT} busy={false} outcome="sent" />);

    expect(screen.queryByLabelText('Repository')).toBeNull();
    expect(screen.queryByText('typed then declined')).toBeNull();
  });

  it('picks a date and a date and time with the iOS picker and sends them in request format', () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });
    const onSubmit = jest.fn();
    render(<CloudRunInputForm pendingInput={DATE_INPUT} busy={false} onSubmit={onSubmit} />);

    expect(screen.queryByText('YYYY-MM-DD')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Due date, not set' }));
    expect(screen.getByTestId('connector-input-date-picker')).toBeTruthy();
    expect(mockPickerMode).toHaveBeenLastCalledWith('date');
    act(() => mockPickerChange(DUE));
    fireEvent.press(screen.getByRole('button', { name: `Due date, ${shownDay(DUE)}` }));
    expect(screen.queryByTestId('connector-input-date-picker')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Reminder, not set' }));
    expect(mockPickerMode).toHaveBeenLastCalledWith('datetime');
    act(() => mockPickerChange(REMIND));
    expect(screen.getByRole('button', { name: `Reminder, ${shownMoment(REMIND)}` })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Send answer' }));
    expect(onSubmit).toHaveBeenCalledWith([
      {
        toolCallId: 'call_dates',
        responses: {
          schedule: {
            action: 'accept',
            content: { due: '2026-11-20', remind: REMIND.toISOString() },
          },
        },
      },
    ]);
  });

  it('clears an optional date and offers no Clear on a required one', () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });
    render(<CloudRunInputForm pendingInput={DATE_INPUT} busy={false} onSubmit={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'Due date, not set' }));
    act(() => mockPickerChange(DUE));
    expect(screen.queryByRole('button', { name: 'Clear Due date' })).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Reminder, not set' }));
    act(() => mockPickerChange(REMIND));
    fireEvent.press(screen.getByRole('button', { name: 'Clear Reminder' }));
    expect(screen.getByRole('button', { name: 'Reminder, not set' })).toBeTruthy();
  });

  it('asks Android for the date and then the time of a date and time field', () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
    const onSubmit = jest.fn();
    render(<CloudRunInputForm pendingInput={DATE_INPUT} busy={false} onSubmit={onSubmit} />);

    fireEvent.press(screen.getByRole('button', { name: 'Reminder, not set' }));
    expect(mockAndroidOpen).toHaveBeenCalledTimes(1);
    const dateStep = mockAndroidOpen.mock.calls[0]![0] as {
      mode: string;
      onValueChange: (event: unknown, date: Date) => void;
    };
    expect(dateStep.mode).toBe('date');
    act(() => dateStep.onValueChange({}, new Date(2026, 10, 20, 0, 0)));
    const timeStep = mockAndroidOpen.mock.calls[1]![0] as {
      mode: string;
      value: Date;
      onValueChange: (event: unknown, date: Date) => void;
    };
    expect(timeStep.mode).toBe('time');
    act(() => timeStep.onValueChange({}, REMIND));

    expect(screen.getByRole('button', { name: `Reminder, ${shownMoment(REMIND)}` })).toBeTruthy();
  });

  it('focuses the first invalid text field and scrolls the chat to it after a failed send', () => {
    const focused: (string | undefined)[] = [];
    jest.spyOn(MockedTextInput.prototype, 'focus').mockImplementation(function focus(
      this: Measured,
    ) {
      focused.push(this.props.accessibilityLabel);
    });
    jest.spyOn(MockedView.prototype, 'measureInWindow').mockImplementation(function measure(
      this: Measured,
      done: MeasureDone,
    ) {
      if (this.props.testID === 'chat-viewport') done(0, 100, 320, 600);
      else if (this.props.testID === 'connector-input-field-call_form:repo_prompt:repo')
        done(0, 900, 320, 60);
      else done(0, 0, 0, 0);
    });
    const list = { getAbsoluteLastScrollOffset: () => 400, scrollToOffset: jest.fn() };
    render(<ScrolledForm list={list} pendingInput={FORM_INPUT} />);

    fireEvent.press(screen.getByRole('button', { name: 'Send answer' }));

    expect(screen.getByText('This is required.')).toBeTruthy();
    expect(focused).toEqual(['Repository']);
    expect(list.scrollToOffset).toHaveBeenCalledWith({
      offset: 1184,
      animated: true,
      skipFirstItemOffset: true,
    });
  });

  it('moves accessibility focus to a required date left empty', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    render(<CloudRunInputForm pendingInput={DATE_INPUT} busy={false} onSubmit={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'Send answer' }));

    expect(screen.getByText('This is required.')).toBeTruthy();
    expect(announce).toHaveBeenCalledTimes(1);
    const target = announce.mock.calls[0]![0] as unknown as Measured;
    expect(target.props.testID).toBe('connector-input-field-call_dates:schedule:due');
    expect(announce.mock.calls[0]![1]).toBe('focus');
  });
});
