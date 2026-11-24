import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockApi = {
  get: jest.fn(),
  listApprovals: jest.fn(),
  changes: jest.fn(),
  startAgentTurn: jest.fn(),
};
let mockAccountKey = 'account-1';
const mockStorage = new Map<string, string>();

jest.mock('@/lib/mmkv', () => ({
  ...jest.requireActual('@/lib/mmkv'),
  mmkvStorage: {
    getItem: (key: string) => mockStorage.get(key) ?? null,
    setItem: (key: string, value: string) => void mockStorage.set(key, value),
    removeItem: (key: string) => void mockStorage.delete(key),
  },
  storage: {
    getString: (key: string) => mockStorage.get(key),
    set: (key: string, value: string) => void mockStorage.set(key, value),
    delete: (key: string) => void mockStorage.delete(key),
    getAllKeys: () => [...mockStorage.keys()],
  },
}));

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
    accountKey: mockAccountKey,
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
import {
  activateCloudAccount,
  invalidateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { clearAccountScopedDrafts } from '@/src/features/chat/draftStore';

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
    mockAccountKey = 'account-1';
    activateCloudAccount(mockAccountKey);
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

  afterEach(() => {
    invalidateCloudAccount();
    clearAccountScopedDrafts();
  });

  it('recovers a draft only for its session and account and clears it after Send', async () => {
    const first = render(<CloudCodeSessionScreen sessionId="session-1" />);
    await first.findByText('reply 1');
    fireEvent.changeText(first.getByLabelText('Message for this session'), 'first session draft');
    first.unmount();

    const second = render(<CloudCodeSessionScreen sessionId="session-2" />);
    await second.findByText('reply 1');
    expect(second.getByLabelText('Message for this session').props.value).toBe('');
    fireEvent.changeText(second.getByLabelText('Message for this session'), 'second session draft');
    second.unmount();

    const reopened = render(<CloudCodeSessionScreen sessionId="session-1" />);
    await reopened.findByText('reply 1');
    expect(reopened.getByLabelText('Message for this session').props.value).toBe(
      'first session draft',
    );
    expect(mockApi.startAgentTurn).not.toHaveBeenCalled();
    mockApi.startAgentTurn.mockResolvedValueOnce(turn('2'));
    await act(async () => fireEvent.press(reopened.getByLabelText('Send to this session')));
    expect(mockApi.startAgentTurn).toHaveBeenCalledTimes(1);
    expect(mockApi.startAgentTurn).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ goal: 'first session draft' }),
      expect.anything(),
    );
    reopened.unmount();

    const sent = render(<CloudCodeSessionScreen sessionId="session-1" />);
    await sent.findByText('reply 1');
    expect(sent.getByLabelText('Message for this session').props.value).toBe('');
    sent.unmount();

    const unsent = render(<CloudCodeSessionScreen sessionId="session-2" />);
    await unsent.findByText('reply 1');
    expect(unsent.getByLabelText('Message for this session').props.value).toBe(
      'second session draft',
    );
    unsent.unmount();

    mockAccountKey = 'account-2';
    activateCloudAccount(mockAccountKey);
    const otherAccount = render(<CloudCodeSessionScreen sessionId="session-2" />);
    await otherAccount.findByText('reply 1');
    expect(otherAccount.getByLabelText('Message for this session').props.value).toBe('');
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

  it('keeps the refused prompt when the person leaves and then reopens the session', async () => {
    let refuse!: (error: Error) => void;
    mockApi.startAgentTurn.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          refuse = reject;
        }),
    );
    const first = render(<CloudCodeSessionScreen sessionId="session-1" />);
    await first.findByText('reply 1');
    fireEvent.changeText(first.getByLabelText('Message for this session'), 'first request');
    await act(async () => {
      fireEvent.press(first.getByLabelText('Send to this session'));
    });
    first.unmount();

    const reopened = render(<CloudCodeSessionScreen sessionId="session-1" />);
    await reopened.findByText('first request');
    fireEvent.changeText(reopened.getByLabelText('Message for this session'), 'second request');
    await act(async () => refuse(new Error('rate limited')));

    expect(await reopened.findByRole('alert')).toHaveTextContent('send');
    expect(reopened.getByLabelText('Message for this session').props.value).toBe(
      'first request\n\nsecond request',
    );
  });

  it('recovers a send refused while away exactly once alongside the saved follow-up', async () => {
    let refuse!: (error: Error) => void;
    mockApi.startAgentTurn.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          refuse = reject;
        }),
    );
    const screen = render(<CloudCodeSessionScreen sessionId="session-1" />);
    await screen.findByText('reply 1');
    fireEvent.changeText(screen.getByLabelText('Message for this session'), 'first request');
    await act(async () => fireEvent.press(screen.getByLabelText('Send to this session')));
    fireEvent.changeText(screen.getByLabelText('Message for this session'), 'saved follow-up');
    screen.unmount();
    await act(async () => refuse(new Error('rate limited')));

    const reopened = render(<CloudCodeSessionScreen sessionId="session-1" />);
    await reopened.findByText('reply 1');
    expect(reopened.getByLabelText('Message for this session').props.value).toBe(
      'first request\n\nsaved follow-up',
    );
    reopened.unmount();

    const reopenedAgain = render(<CloudCodeSessionScreen sessionId="session-1" />);
    await reopenedAgain.findByText('reply 1');
    expect(reopenedAgain.getByLabelText('Message for this session').props.value).toBe(
      'first request\n\nsaved follow-up',
    );
  });
});
