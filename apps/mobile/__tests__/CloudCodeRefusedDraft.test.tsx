import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockApi = {
  get: jest.fn(),
  listApprovals: jest.fn(),
  changes: jest.fn(),
  startAgentTurn: jest.fn(),
};

jest.mock('@/src/features/cloud-code/service', () => ({
  get cloudCodeApi() {
    return mockApi;
  },
  CLOUD_CODE_OPEN_ERROR: 'open',
  CLOUD_CODE_SEND_ERROR: 'send',
  CLOUD_CODE_STOP_ERROR: 'stop',
  CLOUD_CODE_DECISION_ERROR: 'decision',
  CLOUD_CODE_UNARCHIVE_ERROR: 'unarchive',
  describeCloudCodeError: (_error: unknown, fallback: string) => fallback,
  isMissingCloudCodeSession: () => false,
  newCloudCodeIdempotencyKey: () => 'request-1',
}));

jest.mock('@/src/features/cloud-code/useCloudCodeAccess', () => ({
  useCloudCodeAccess: () => ({
    ready: true,
    signedIn: true,
    accountKey: 'account-1',
    activate: jest.fn(),
  }),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    setParams: jest.fn(),
  }),
}));

jest.mock('@/src/lib/Capabilities', () => ({
  useCapability: () => false,
}));

import { CloudCodeSessionScreen } from '@/src/features/cloud-code/CloudCodeSessionScreen';

const session = {
  id: 'session-1',
  title: 'Fix parser',
  state: 'ready',
  archivedAt: null,
  runtimeId: null,
  repositoryUrl: 'https://github.com/acme/app',
  workingBranch: 'agi/work',
  baseBranch: 'main',
  repositoryBranch: 'main',
  pullRequestUrl: null,
  lastError: null,
};

function turn(id: string) {
  return {
    turnId: id,
    goal: `goal ${id}`,
    mode: 'agent',
    stopReason: 'done',
    stepsUsed: 1,
    inputTokens: 0,
    outputTokens: 0,
    cancelRequestedAt: null,
    finalMessage: `reply ${id}`,
    errorMessage: null,
    createdAt: `2026-10-22T00:00:0${id}Z`,
    steps: [],
  };
}

function detail(turns: ReturnType<typeof turn>[]) {
  return { session, terminalEntries: [], turns };
}

describe('CloudCodeSessionScreen refused send', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.get.mockResolvedValue(detail([turn('1')]));
    mockApi.listApprovals.mockResolvedValue([]);
    mockApi.changes.mockResolvedValue({
      session,
      base: 'main',
      workingBranch: 'agi/work',
      files: [],
      diff: '',
      diffTruncated: false,
    });
  });

  it('gives the refused message back ahead of a newer draft instead of dropping it', async () => {
    let refuse: ((error: Error) => void) | undefined;
    mockApi.startAgentTurn.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          refuse = reject;
        }),
    );
    const { findByText, getByLabelText } = render(<CloudCodeSessionScreen sessionId="session-1" />);
    await findByText('reply 1');

    fireEvent.changeText(getByLabelText('Message for this session'), 'first request');
    await act(async () => {
      fireEvent.press(getByLabelText('Send to this session'));
    });
    await waitFor(() => expect(refuse).toBeDefined());
    expect(getByLabelText('Message for this session').props.value).toBe('');

    fireEvent.changeText(getByLabelText('Message for this session'), 'second request');
    await act(async () => {
      refuse?.(new Error('rate limited'));
    });

    await waitFor(() =>
      expect(getByLabelText('Message for this session').props.value).toBe(
        'first request\n\nsecond request',
      ),
    );
  });

  it('still restores the refused message alone when nothing newer was typed', async () => {
    let refuse: ((error: Error) => void) | undefined;
    mockApi.startAgentTurn.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          refuse = reject;
        }),
    );
    const { findByText, getByLabelText } = render(<CloudCodeSessionScreen sessionId="session-1" />);
    await findByText('reply 1');

    fireEvent.changeText(getByLabelText('Message for this session'), 'first request');
    await act(async () => {
      fireEvent.press(getByLabelText('Send to this session'));
    });
    await waitFor(() => expect(refuse).toBeDefined());
    await act(async () => {
      refuse?.(new Error('rate limited'));
    });

    await waitFor(() =>
      expect(getByLabelText('Message for this session').props.value).toBe('first request'),
    );
  });
});
