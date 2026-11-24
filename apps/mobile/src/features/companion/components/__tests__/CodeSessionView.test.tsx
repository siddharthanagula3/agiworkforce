import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { act } from 'react';
import { Modal } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: mockPush }),
}));

let mockVoiceAllowed = false;
jest.mock('@/src/lib/Capabilities', () => ({
  useCapability: () => mockVoiceAllowed,
}));

const mockSpeechStop = jest.fn(async () => undefined);
jest.mock('@/src/features/voice/services/tts', () => ({
  speechOptionsFromSettings: () => ({}),
  start: jest.fn(() => ({ done: new Promise(() => undefined), stop: mockSpeechStop })),
}));
jest.mock('@/src/features/voice/components/VoiceInputButton', () => ({
  VoiceInputButton: () => null,
}));

jest.mock('../../remote-code/service', () => ({
  attachCodeSession: jest.fn(async () => true),
  createCodeRequestId: () => 'phone-follow-up',
  detachCodeSession: jest.fn(async () => true),
  steerCodeSession: jest.fn(async () => true),
  interruptCodeTurn: jest.fn(async () => true),
  answerCodeApproval: jest.fn(async () => true),
  answerCodeQuestion: jest.fn(async () => true),
  requestCodeTranscript: jest.fn(async () => true),
  listCodeSessions: jest.fn(async () => true),
}));

import * as mockSpeech from '@/src/features/voice/services/tts';
import * as mockService from '../../remote-code/service';
import {
  ingestRemoteCodeControl,
  useRemoteCodePreferences,
  useRemoteCodeStore,
} from '../../remote-code/store';
import { useCodePreferences } from '../../../settings/code/store';
import { CodeSessionView } from '../CodeSessionView';

const SENT_AT = '2026-09-17T12:00:00.000Z';
const onBack = jest.fn();

function openSession(overrides: Record<string, unknown> = {}) {
  act(() => {
    ingestRemoteCodeControl('code.session.snapshot', {
      action: 'code.session.snapshot',
      version: 1,
      rootId: 'root-1',
      threadId: 'thread-1',
      title: 'Fix retry backoff',
      status: 'awaiting_approval',
      activeTurnId: 'turn-1',
      partialResponse: '',
      messages: [{ role: 'user', text: 'make retries back off', turnId: 'turn-1' }],
      pendingApprovals: [
        { turnId: 'turn-1', requestId: 'ap-1', summary: 'Run pnpm test', detail: 'shell' },
      ],
      fileChanges: [
        { path: 'src/retry.test.ts', kind: 'created', tool: 'write_file', changedAt: SENT_AT },
      ],
      queuedGuidance: [],
      syncedAt: SENT_AT,
      ...overrides,
    });
  });
}

function liveEvent(event: Record<string, unknown>) {
  act(() => {
    ingestRemoteCodeControl('code.session.event', {
      action: 'code.session.event',
      version: 1,
      rootId: 'root-1',
      threadId: 'thread-1',
      event,
      sentAt: SENT_AT,
    });
  });
}

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderSession(props: { focusApprovalId?: string } = {}) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <CodeSessionView rootId="root-1" threadId="thread-1" onBack={onBack} {...props} />
    </SafeAreaProvider>,
  );
}

const idle = { status: 'idle', activeTurnId: null, pendingApprovals: [] };

beforeEach(() => {
  jest.clearAllMocks();
  mockVoiceAllowed = false;
  useRemoteCodeStore.getState().reset();
  useRemoteCodePreferences.setState({ followUpBehavior: 'queue' });
  useCodePreferences.setState({ wrapLongLines: false });
});

describe('CodeSessionView', () => {
  it('keeps an unsent draft after the session screen is reopened', () => {
    openSession(idle);
    const view = renderSession();
    fireEvent.changeText(screen.getByLabelText('Message for this session'), 'Unsent text');
    view.unmount();

    renderSession();
    expect(screen.getByLabelText('Message for this session')).toHaveProp('value', 'Unsent text');
    expect(mockService.steerCodeSession).not.toHaveBeenCalled();
  });

  it('keeps an in-flight send scoped across reopen and preserves edits made before it settles', async () => {
    let accepted!: (value: boolean) => void;
    (mockService.steerCodeSession as jest.Mock).mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        accepted = resolve;
      }),
    );
    openSession(idle);
    const view = renderSession();
    fireEvent.changeText(screen.getByLabelText('Message for this session'), 'Original text');
    fireEvent.press(screen.getByLabelText('Send to this session'));
    view.unmount();

    renderSession();
    expect(screen.getByLabelText('Message for this session')).toHaveProp('value', 'Original text');
    fireEvent.changeText(screen.getByLabelText('Message for this session'), 'A separate draft');
    const waiting = screen.queryByLabelText('Send to this session');
    if (waiting) fireEvent.press(waiting);
    expect(mockService.steerCodeSession).toHaveBeenCalledTimes(1);
    await act(async () => accepted(true));
    liveEvent({
      type: 'guidance-delivered',
      turnId: 'turn-2',
      requestIds: ['phone-follow-up'],
      queuedGuidance: [],
    });
    expect(screen.getByLabelText('Message for this session')).toHaveProp(
      'value',
      'A separate draft',
    );
  });

  it('lets a rejected follow-up be restored without overwriting a newer draft', async () => {
    renderSession();
    openSession(idle);
    const input = screen.getByLabelText('Message for this session');
    fireEvent.changeText(input, 'Keep this exact follow-up.');
    await act(async () => fireEvent.press(screen.getByLabelText('Send to this session')));
    fireEvent.changeText(input, 'My newer draft');
    liveEvent({
      type: 'guidance-rejected',
      reason: 'start-failed',
      requestIds: ['phone-follow-up'],
      rejectedGuidance: ['Keep this exact follow-up.'],
      queuedGuidance: [],
    });
    openSession(idle);

    expect(screen.getByText('Your computer could not start this follow-up.')).toBeTruthy();
    expect(screen.getByText('Keep this exact follow-up.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore draft' })).toBeDisabled();
    expect(input).toHaveProp('value', 'My newer draft');

    fireEvent.changeText(input, '');
    fireEvent.press(screen.getByRole('button', { name: 'Restore draft' }));
    expect(input).toHaveProp('value', 'Keep this exact follow-up.');
    expect(screen.queryByRole('button', { name: 'Restore draft' })).toBeNull();
  });

  it('explains an interrupted saved session until its computer starts the follow-up', async () => {
    renderSession();
    openSession({ ...idle, status: 'failed' });

    expect(screen.getByText('make retries back off')).toBeTruthy();
    const notice = 'The previous turn stopped early. You can continue here.';
    expect(screen.getByText(notice)).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Message for this session'), 'Continue the fix');
    fireEvent.press(screen.getByLabelText('Send to this session'));
    await waitFor(() =>
      expect(mockService.steerCodeSession).toHaveBeenCalledWith(
        'root-1',
        'thread-1',
        'Continue the fix',
        false,
        'phone-follow-up',
      ),
    );
    expect(screen.getByText(notice)).toBeTruthy();

    liveEvent({ type: 'turn-started', turnId: 'turn-2' });
    expect(screen.queryByText(notice)).toBeNull();
  });

  it('keeps the draft until the computer reports the outcome for that request', async () => {
    renderSession();
    openSession(idle);
    const field = screen.getByLabelText('Message for this session');
    fireEvent.changeText(field, 'Wait for the computer');
    await act(async () => fireEvent.press(screen.getByLabelText('Send to this session')));

    expect(field).toHaveProp('value', 'Wait for the computer');
    expect(screen.getByText('Waiting for your computer to accept the follow-up…')).toBeTruthy();
    liveEvent({ type: 'guidance-queued', queuedGuidance: ['Wait for the computer'] });
    expect(field).toHaveProp('value', 'Wait for the computer');
    liveEvent({
      type: 'guidance-queued',
      requestIds: ['other-request'],
      queuedGuidance: ['same text'],
    });
    expect(field).toHaveProp('value', 'Wait for the computer');
    liveEvent({
      type: 'guidance-queued',
      requestIds: ['phone-follow-up'],
      queuedGuidance: ['Wait for the computer'],
    });
    expect(field).toHaveProp('value', '');
  });

  it('keeps the message when the computer never confirms the follow-up', async () => {
    jest.useFakeTimers();
    try {
      renderSession();
      openSession(idle);
      const field = screen.getByLabelText('Message for this session');
      fireEvent.changeText(field, 'Keep this draft');
      await act(async () => fireEvent.press(screen.getByLabelText('Send to this session')));
      act(() => jest.advanceTimersByTime(30_000));
      expect(field).toHaveProp('value', 'Keep this draft');
      expect(
        screen.getByText('Delivery is unconfirmed. Check the conversation before sending again.'),
      ).toBeTruthy();

      openSession({ ...idle, confirmedGuidanceIds: ['unrelated-follow-up'] });
      expect(field).toHaveProp('value', 'Keep this draft');
      openSession({ ...idle, confirmedGuidanceIds: ['phone-follow-up'] });
      expect(field).toHaveProp('value', '');
      expect(screen.queryByText(/Delivery is unconfirmed/)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps a newer edit when a reopened snapshot confirms the original follow-up', async () => {
    renderSession();
    openSession(idle);
    const field = screen.getByLabelText('Message for this session');
    fireEvent.changeText(field, 'First follow-up');
    await act(async () => fireEvent.press(screen.getByLabelText('Send to this session')));
    fireEvent.changeText(field, 'New draft');

    openSession({ ...idle, confirmedGuidanceIds: ['phone-follow-up'] });

    expect(field).toHaveProp('value', 'New draft');
    expect(screen.queryByText(/Waiting for your computer/)).toBeNull();
  });

  it('restores a refusal missed while detached and keeps it dismissed after replay', async () => {
    openSession(idle);
    const view = renderSession();
    const input = screen.getByLabelText('Message for this session');
    fireEvent.changeText(input, 'Keep this follow-up');
    await act(async () => fireEvent.press(screen.getByLabelText('Send to this session')));
    view.unmount();

    const refusal = {
      requestId: 'phone-follow-up',
      text: 'Keep this follow-up',
      reason: 'start-failed',
    };
    openSession({ ...idle, rejectedGuidance: [refusal] });
    renderSession();
    expect(screen.queryByText(/Waiting for your computer/)).toBeNull();
    expect(screen.getByText('Your computer could not start this follow-up.')).toBeTruthy();
    openSession({ ...idle, rejectedGuidance: [refusal] });
    expect(screen.getAllByRole('button', { name: 'Restore draft' })).toHaveLength(1);

    fireEvent.press(screen.getByRole('button', { name: 'Restore draft' }));
    openSession({ ...idle, rejectedGuidance: [refusal] });
    liveEvent({
      type: 'guidance-rejected',
      reason: 'start-failed',
      requestIds: [refusal.requestId],
      rejectedGuidance: [refusal.text],
      queuedGuidance: [],
    });
    expect(screen.queryByRole('button', { name: 'Restore draft' })).toBeNull();
    expect(screen.getByLabelText('Message for this session')).toHaveProp('value', refusal.text);
    expect(mockService.steerCodeSession).toHaveBeenCalledTimes(1);
  });

  it('shows the computer’s own message when it reports a live runtime stop', () => {
    renderSession();
    openSession(idle);
    liveEvent({ type: 'runtime-stopped', message: 'The runtime on the computer stopped.' });

    expect(screen.getByRole('alert')).toHaveTextContent('The runtime on the computer stopped.');
    expect(
      screen.queryByText('The previous turn stopped early. You can continue here.'),
    ).toBeNull();
  });

  it('attaches on open and detaches on close', () => {
    const view = renderSession();
    expect(mockService.attachCodeSession).toHaveBeenCalledWith('root-1', 'thread-1');
    expect(screen.getByText('Opening the session on Desktop…')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Go back'));
    expect(onBack).toHaveBeenCalled();
    view.unmount();
    expect(mockService.detachCodeSession).toHaveBeenCalledWith('root-1', 'thread-1');
  });

  it('reads the conversation when the session opens, and earlier pages on request', async () => {
    renderSession();
    expect(mockService.requestCodeTranscript).not.toHaveBeenCalled();
    openSession(idle);
    await waitFor(() =>
      expect(mockService.requestCodeTranscript).toHaveBeenCalledWith('root-1', 'thread-1', null),
    );
    expect(screen.queryByText('Load earlier messages')).toBeNull();

    act(() => {
      ingestRemoteCodeControl('code.session.transcript', {
        action: 'code.session.transcript',
        version: 1,
        rootId: 'root-1',
        threadId: 'thread-1',
        before: null,
        messages: [
          { role: 'user', text: 'make retries back off', index: 7, turnId: 'turn-1' },
          { role: 'assistant', text: 'Retries now back off.', index: 8, turnId: 'turn-1' },
        ],
        hasEarlier: true,
        syncedAt: SENT_AT,
      });
    });

    expect(screen.getAllByText('make retries back off')).toHaveLength(1);
    expect(screen.getByText('Retries now back off.')).toBeTruthy();
    fireEvent.press(screen.getByText('Load earlier messages'));
    expect(mockService.requestCodeTranscript).toHaveBeenLastCalledWith('root-1', 'thread-1', 7);
  });

  it('shows the turn as a conversation, with its steps folded above the reply', async () => {
    renderSession();
    openSession({
      ...idle,
      messages: [
        { role: 'user', text: 'make retries back off', turnId: 'turn-1' },
        { role: 'assistant', text: 'Retries now back off.', turnId: 'turn-1' },
      ],
      tools: [
        {
          toolCallId: 'call-1',
          name: 'read_file',
          summary: 'Read src/retry.ts',
          state: 'done',
          output: 'export const delay = 3;',
          turnId: 'turn-1',
        },
        {
          toolCallId: 'call-2',
          name: 'shell',
          summary: 'pnpm test',
          state: 'failed',
          output: '1 failed',
          turnId: 'turn-1',
        },
      ],
      thinking: [{ turnId: 'turn-1', text: 'The delay is a constant.' }],
    });

    expect(await screen.findByText('make retries back off')).toBeTruthy();
    expect(screen.getByText('Retries now back off.')).toBeTruthy();
    expect(screen.getByText('pnpm test failed')).toBeTruthy();
    expect(screen.queryByText('Read src/retry.ts')).toBeNull();

    fireEvent.press(screen.getByLabelText('Ran 2 steps'));
    fireEvent.press(screen.getByLabelText('Read src/retry.ts'));
    expect(screen.getByText('export const delay = 3;')).toBeTruthy();

    expect(screen.queryByText('The delay is a constant.')).toBeNull();
    fireEvent.press(screen.getByLabelText('Thought process'));
    expect(screen.getByText('The delay is a constant.')).toBeTruthy();
  });

  it('shows what a running turn is doing and how many tasks run', async () => {
    renderSession();
    openSession({
      status: 'running',
      pendingApprovals: [],
      partialResponse: 'Looking at the retry helper',
      runningTasks: 3,
      queuedGuidance: ['also add a test'],
    });

    expect(await screen.findByText('Looking at the retry helper')).toBeTruthy();
    expect(screen.getByText('Working · 3 running tasks')).toBeTruthy();
    expect(screen.getByText('also add a test')).toBeTruthy();
    expect(screen.getByText('Queued for after this turn')).toBeTruthy();

    liveEvent({ type: 'thinking-delta', turnId: 'turn-1', delta: 'Check the caller first.' });
    fireEvent.press(screen.getByLabelText('Thinking'));
    expect(screen.getByText('Check the caller first.')).toBeTruthy();
  });

  it('says when an allow is waiting at the computer, and when it was not allowed there', async () => {
    renderSession();
    openSession();
    const held = (status: string, message: string) =>
      liveEvent({ type: 'approval-held', requestId: 'ap-1', status, message });

    held('waiting', 'This needs to be allowed at your computer. A dialog is open there now.');
    expect(
      await screen.findByText(
        'This needs to be allowed at your computer. A dialog is open there now.',
      ),
    ).toBeTruthy();

    held('refused', 'Not allowed at your computer. The agent is still waiting for an answer.');
    expect(
      await screen.findByText(
        'Not allowed at your computer. The agent is still waiting for an answer.',
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('Approve Run pnpm test')).toBeTruthy();
    expect(screen.queryByText('Working')).toBeNull();
  });

  it('answers the approval the phone shows', async () => {
    renderSession();
    openSession();

    fireEvent.press(await screen.findByLabelText('Approve Run pnpm test'));
    expect(mockService.answerCodeApproval).toHaveBeenCalledWith(
      'root-1',
      'thread-1',
      'turn-1',
      'ap-1',
      true,
    );
    fireEvent.press(screen.getByLabelText('Deny Run pnpm test'));
    expect(mockService.answerCodeApproval).toHaveBeenLastCalledWith(
      'root-1',
      'thread-1',
      'turn-1',
      'ap-1',
      false,
    );
  });

  it.each(['snapshot', 'live event'])(
    'offers only Deny for a cut approval from a %s',
    async (source) => {
      const approval = {
        turnId: 'turn-1',
        requestId: 'ap-cut',
        summary: 'Run project checks',
        detail: 'pnpm test',
        kind: 'Exec',
        riskLevel: 'high',
        truncated: true,
      };
      renderSession();
      if (source === 'snapshot') {
        openSession({ pendingApprovals: [approval] });
      } else {
        openSession({ pendingApprovals: [] });
        liveEvent({ type: 'approval-requested', ...approval });
      }

      expect(await screen.findByText('Command · High risk')).toBeOnTheScreen();
      expect(screen.getByText('The full request is unavailable on this phone.')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Approve Run project checks' })).toBeNull();
      expect(mockService.answerCodeApproval).not.toHaveBeenCalled();
      fireEvent.press(screen.getByRole('button', { name: 'Deny Run project checks' }));
      expect(mockService.answerCodeApproval).toHaveBeenCalledWith(
        'root-1',
        'thread-1',
        'turn-1',
        'ap-cut',
        false,
      );
    },
  );

  it('sends a question from an older computer to be answered there', async () => {
    renderSession();
    openSession({
      status: 'running',
      pendingApprovals: [],
      pendingQuestions: [{ turnId: 'turn-1', requestId: 'q-1', question: 'Which branch?' }],
    });

    expect(await screen.findByText('Which branch?')).toBeTruthy();
    expect(screen.getByText('Answer on your computer')).toBeTruthy();
    expect(screen.queryByLabelText(/Approve/)).toBeNull();
    expect(screen.queryByText('Skip')).toBeNull();

    liveEvent({ type: 'user-input-answered', requestId: 'q-1' });
    expect(screen.queryByText('Which branch?')).toBeNull();
  });

  it('answers a question with one of its choices, or skips it', async () => {
    renderSession();
    openSession({
      status: 'awaiting_approval',
      pendingApprovals: [],
      pendingQuestions: [
        {
          turnId: 'turn-1',
          requestId: 'q-1',
          question: 'Which branch?',
          options: ['main', 'release'],
          answerable: true,
        },
      ],
    });

    fireEvent.press(await screen.findByLabelText('Answer: release'));
    await waitFor(() =>
      expect(mockService.answerCodeQuestion).toHaveBeenCalledWith(
        'root-1',
        'thread-1',
        'turn-1',
        'q-1',
        'release',
      ),
    );

    fireEvent.press(screen.getByText('Skip'));
    await waitFor(() =>
      expect(mockService.answerCodeQuestion).toHaveBeenLastCalledWith(
        'root-1',
        'thread-1',
        'turn-1',
        'q-1',
        null,
      ),
    );
  });

  it('answers a question that has no choices by typing, and says when it was not sent', async () => {
    renderSession();
    openSession({
      status: 'running',
      pendingApprovals: [],
      pendingQuestions: [
        { turnId: 'turn-1', requestId: 'q-1', question: 'Which port?', answerable: true },
      ],
    });
    (mockService.answerCodeQuestion as jest.Mock).mockResolvedValueOnce(false);

    fireEvent.changeText(await screen.findByLabelText('Type your answer'), ' 8080 ');
    fireEvent.press(screen.getByText('Send answer'));
    await waitFor(() =>
      expect(mockService.answerCodeQuestion).toHaveBeenCalledWith(
        'root-1',
        'thread-1',
        'turn-1',
        'q-1',
        '8080',
      ),
    );
    expect(
      await screen.findByText(
        'The answer was not sent. Check the connection to your computer and try again.',
      ),
    ).toBeTruthy();
  });

  it('puts Stop in the send slot while a turn runs and nothing is typed', async () => {
    renderSession();
    openSession({ status: 'running', pendingApprovals: [] });

    fireEvent.press(await screen.findByLabelText('Stop the current turn'));
    expect(mockService.interruptCodeTurn).toHaveBeenCalledWith('root-1', 'thread-1', 'turn-1');
    expect(mockService.steerCodeSession).not.toHaveBeenCalled();
  });

  it.each([
    ['queue', false, 'Queue for after this turn'],
    ['steer', true, 'Send to this session'],
  ] as const)(
    'sends a message during a turn by the stored %s follow-up behaviour',
    async (behavior, interrupt, label) => {
      useRemoteCodePreferences.setState({ followUpBehavior: behavior });
      renderSession();
      openSession({ status: 'running', pendingApprovals: [] });

      fireEvent.changeText(
        await screen.findByLabelText('Message for this session'),
        'use the retry helper',
      );
      fireEvent.press(screen.getByLabelText(label));

      await waitFor(() =>
        expect(mockService.steerCodeSession).toHaveBeenCalledWith(
          'root-1',
          'thread-1',
          'use the retry helper',
          interrupt,
          'phone-follow-up',
        ),
      );
      expect(mockService.interruptCodeTurn).not.toHaveBeenCalled();
    },
  );

  it('starts the next turn from an idle session, and keeps the text when it was not sent', async () => {
    renderSession();
    openSession(idle);
    (mockService.steerCodeSession as jest.Mock).mockResolvedValueOnce(false);

    const field = await screen.findByLabelText('Message for this session');
    fireEvent.changeText(field, 'now add a test');
    fireEvent.press(screen.getByLabelText('Send to this session'));

    await waitFor(() =>
      expect(mockService.steerCodeSession).toHaveBeenCalledWith(
        'root-1',
        'thread-1',
        'now add a test',
        false,
        'phone-follow-up',
      ),
    );
    expect(
      await screen.findByText('Not sent. Check the connection to your computer and try again.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Message for this session').props.value).toBe('now add a test');
  });

  it('shows the message the phone sent once the computer has taken it', async () => {
    renderSession();
    openSession(idle);

    liveEvent({ type: 'turn-started', turnId: 'turn-2' });
    liveEvent({
      type: 'guidance-delivered',
      turnId: 'turn-2',
      queuedGuidance: [],
      text: 'now add a test',
    });
    expect(await screen.findByText('now add a test')).toBeTruthy();

    liveEvent({
      type: 'turn-finished',
      turnId: 'turn-2',
      outcome: 'completed',
      response: 'Added a test.',
    });
    expect(await screen.findByText('Added a test.')).toBeTruthy();
  });

  it('opens generated files, diffs and test results from the pill above the message box', async () => {
    renderSession();
    openSession(idle);
    expect(
      await screen.findByLabelText('1 file changed. 0 lines added, 0 lines removed'),
    ).toBeTruthy();

    liveEvent({
      type: 'diff',
      diff: { path: 'src/retry.ts', patch: '@@ -1 +1 @@\n-3\n+5', truncated: true },
    });
    liveEvent({
      type: 'test-run',
      testRun: {
        toolCallId: 'call-test',
        command: 'pnpm exec vitest run',
        status: 'failed',
        passed: 4,
        failed: 1,
        skipped: null,
        output: 'retry.test.ts > backs off',
        finishedAt: SENT_AT,
      },
    });

    expect(screen.getByText('Tests failed')).toBeTruthy();
    expect(screen.queryByText('src/retry.test.ts')).toBeNull();
    fireEvent.press(screen.getByLabelText('2 files changed. 1 lines added, 1 lines removed'));

    expect(screen.getByText('src/retry.test.ts')).toBeTruthy();
    expect(screen.getByText('New file')).toBeTruthy();
    expect(screen.getByText('src/retry.ts')).toBeTruthy();
    expect(screen.getByText('+5')).toBeTruthy();
    expect(
      screen.getByText(
        'The diff is longer than a phone view. Open it on Desktop to read the rest.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('4 passed · 1 failed')).toBeTruthy();
    expect(screen.getByText('retry.test.ts > backs off')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Close changes'));
    expect(screen.queryByText('New file')).toBeNull();
  });

  it('shows no changes pill for a session that changed nothing', async () => {
    renderSession();
    openSession({ ...idle, fileChanges: [] });
    expect(await screen.findByLabelText('Message for this session')).toBeTruthy();
    expect(screen.queryByTestId('remote-code-changes-pill')).toBeNull();
  });

  it.each([
    [false, true],
    [true, undefined],
  ])('with wrap long lines %s the diff scrolls sideways: %s', async (wrap, horizontal) => {
    useCodePreferences.setState({ wrapLongLines: wrap });
    renderSession();
    openSession(idle);
    liveEvent({
      type: 'diff',
      diff: { path: 'src/retry.ts', patch: '@@ -1 +1 @@\n-3\n+5', truncated: false },
    });

    fireEvent.press(await screen.findByTestId('remote-code-changes-pill'));

    expect(screen.getByTestId('remote-code-diff').props.horizontal).toBe(horizontal);
    expect(screen.getByText('+5')).toBeTruthy();
  });

  it('names the session and where it runs on the computer', async () => {
    useRemoteCodeStore.setState({
      sessions: [
        {
          rootId: 'root-1',
          threadId: 'thread-1',
          title: 'Fix retry backoff',
          folder: 'agiworkforce',
          branch: 'main',
          status: 'idle',
          model: null,
          updatedAt: SENT_AT,
        },
      ],
    });
    renderSession();
    openSession();

    expect(await screen.findByText('Fix retry backoff')).toBeTruthy();
    expect(screen.getByText('agiworkforce · main')).toBeTruthy();
    expect(screen.getByText('Needs approval')).toBeTruthy();
  });

  it('reaches plan usage and the computer from the session menu', async () => {
    renderSession();
    openSession(idle);

    fireEvent.press(await screen.findByLabelText('More about this session'));
    fireEvent.press(screen.getByText('Plan usage'));
    act(() => {
      screen.UNSAFE_getAllByType(Modal).forEach((modal) => modal.props.onDismiss?.());
    });
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/cloud-usage');
  });

  it('reads a reply aloud with the phone voice only where voice is allowed', async () => {
    const reply = {
      ...idle,
      messages: [{ role: 'assistant', text: 'Retries now back off.', turnId: 'turn-1' }],
    };
    const first = renderSession();
    openSession(reply);
    expect(await screen.findByText('Retries now back off.')).toBeTruthy();
    expect(screen.queryByLabelText('Read aloud')).toBeNull();
    first.unmount();

    mockVoiceAllowed = true;
    renderSession();
    fireEvent.press(await screen.findByLabelText('Read aloud'));
    expect(mockSpeech.start).toHaveBeenCalledWith('Retries now back off.', {});
    fireEvent.press(screen.getByLabelText('Stop reading'));
    expect(mockSpeechStop).toHaveBeenCalled();
  });
});
