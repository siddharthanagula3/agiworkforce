import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { act } from 'react';

jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);
jest.mock('@/src/ui/theme', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#888888' }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

jest.mock('../../remote-code/service', () => ({
  attachCodeSession: jest.fn(async () => true),
  detachCodeSession: jest.fn(async () => true),
  steerCodeSession: jest.fn(async () => true),
  interruptCodeTurn: jest.fn(async () => true),
  answerCodeApproval: jest.fn(async () => true),
  listCodeSessions: jest.fn(async () => true),
}));

import * as mockService from '../../remote-code/service';
import { ingestRemoteCodeControl, useRemoteCodeStore } from '../../remote-code/store';
import { CodeSessionView } from '../CodeSessionView';

const SENT_AT = '2026-09-17T12:00:00.000Z';

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
      messages: [{ role: 'user', text: 'make retries back off' }],
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

beforeEach(() => {
  jest.clearAllMocks();
  useRemoteCodeStore.getState().reset();
});

describe('CodeSessionView', () => {
  it('attaches on open and detaches on close', () => {
    const view = render(<CodeSessionView rootId="root-1" threadId="thread-1" />);
    expect(mockService.attachCodeSession).toHaveBeenCalledWith('root-1', 'thread-1');
    view.unmount();
    expect(mockService.detachCodeSession).toHaveBeenCalledWith('root-1', 'thread-1');
  });

  it('answers the approval the phone shows', async () => {
    render(<CodeSessionView rootId="root-1" threadId="thread-1" />);
    openSession();

    fireEvent.press(await screen.findByLabelText('Approve Run pnpm test'));
    expect(mockService.answerCodeApproval).toHaveBeenCalledWith(
      'root-1',
      'thread-1',
      'turn-1',
      'ap-1',
      true,
    );
  });

  it('steers a running turn, stopping it first only when asked', async () => {
    render(<CodeSessionView rootId="root-1" threadId="thread-1" />);
    openSession();

    fireEvent.changeText(
      await screen.findByLabelText('Guidance for this session'),
      'use the retry helper',
    );
    fireEvent(
      screen.getByLabelText('Stop the current turn before sending guidance'),
      'valueChange',
      true,
    );
    fireEvent.press(screen.getByLabelText('Send guidance'));

    await waitFor(() =>
      expect(mockService.steerCodeSession).toHaveBeenCalledWith(
        'root-1',
        'thread-1',
        'use the retry helper',
        true,
      ),
    );
  });

  it('shows generated files, diffs and test results from the host', async () => {
    render(<CodeSessionView rootId="root-1" threadId="thread-1" />);
    openSession({ status: 'idle', activeTurnId: null, pendingApprovals: [] });
    act(() => {
      const event = (liveEvent: Record<string, unknown>) =>
        ingestRemoteCodeControl('code.session.event', {
          action: 'code.session.event',
          version: 1,
          rootId: 'root-1',
          threadId: 'thread-1',
          event: liveEvent,
          sentAt: SENT_AT,
        });
      event({
        type: 'diff',
        diff: { path: 'src/retry.ts', patch: '@@ -1 +1 @@\n-3\n+5', truncated: true },
      });
      event({
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
    });

    expect(await screen.findByText('src/retry.test.ts')).toBeTruthy();
    expect(screen.getByText('New file')).toBeTruthy();
    expect(screen.getByText('Diff · src/retry.ts')).toBeTruthy();
    expect(screen.getByText('+5')).toBeTruthy();
    expect(
      screen.getByText(
        'The diff is longer than a phone view. Open it on Desktop to read the rest.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('4 passed · 1 failed')).toBeTruthy();
    expect(screen.getByText('retry.test.ts > backs off')).toBeTruthy();
  });
});
