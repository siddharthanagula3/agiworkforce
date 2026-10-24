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

function changed(count: number) {
  const files = Array.from({ length: count }, (_, index) => ({
    path: `src/file-${index}.ts`,
    state: 'modified',
  }));
  const diff = files
    .map(
      (file) =>
        `diff --git a/${file.path} b/${file.path}\n--- a/${file.path}\n+++ b/${file.path}\n@@ -1 +1 @@\n-old\n+new`,
    )
    .join('\n');
  return { session, base: 'main', workingBranch: 'agi/work', files, diff, diffTruncated: false };
}

describe('CloudCodeSessionScreen changes wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.get.mockResolvedValue(detail([turn('1')]));
    mockApi.listApprovals.mockResolvedValue([]);
    mockApi.changes.mockResolvedValue(changed(5));
    mockApi.startAgentTurn.mockResolvedValue({});
  });

  it('shows the changes card and totals pill without opening the sheet', async () => {
    const { findByTestId, getByText, getByTestId, getByLabelText } = render(
      <CloudCodeSessionScreen sessionId="session-1" />,
    );

    await findByTestId('cloud-code-changes-card');
    expect(getByText('5 files changed')).toBeTruthy();
    expect(getByText('src/file-2.ts')).toBeTruthy();
    expect(getByLabelText('View 2 more files')).toBeTruthy();
    expect(getByTestId('cloud-code-changes-pill')).toBeTruthy();
    expect(mockApi.changes).toHaveBeenCalledWith('session-1');
  });

  it('opens the Changes sheet from the card footer', async () => {
    const { findByLabelText, findByTestId } = render(
      <CloudCodeSessionScreen sessionId="session-1" />,
    );
    fireEvent.press(await findByLabelText('View 2 more files'));
    expect(await findByTestId('cloud-code-changes-totals')).toBeTruthy();
  });

  it('reloads the changes after a turn finishes', async () => {
    const { findByTestId, getByLabelText } = render(
      <CloudCodeSessionScreen sessionId="session-1" />,
    );
    await findByTestId('cloud-code-changes-card');
    expect(mockApi.changes).toHaveBeenCalledTimes(1);

    mockApi.get.mockResolvedValue(detail([turn('1'), turn('2')]));
    mockApi.changes.mockResolvedValue(changed(7));
    fireEvent.changeText(getByLabelText('Message for this session'), 'one more thing');
    await act(async () => {
      fireEvent.press(getByLabelText('Send to this session'));
    });

    await waitFor(() => expect(mockApi.changes).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getByLabelText('View 4 more files')).toBeTruthy());
  });

  it('shows no card when nothing changed', async () => {
    mockApi.changes.mockResolvedValue(changed(0));
    const { queryByTestId, findByText } = render(<CloudCodeSessionScreen sessionId="session-1" />);
    await findByText('reply 1');
    await waitFor(() => expect(mockApi.changes).toHaveBeenCalled());
    expect(queryByTestId('cloud-code-changes-card')).toBeNull();
    expect(queryByTestId('cloud-code-changes-pill')).toBeNull();
  });
});
