import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { act } from 'react';
import { Modal } from 'react-native';

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

function renderSession(props: { focusApprovalId?: string } = {}) {
  return render(<CodeSessionView rootId="root-1" threadId="thread-1" onBack={onBack} {...props} />);
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
