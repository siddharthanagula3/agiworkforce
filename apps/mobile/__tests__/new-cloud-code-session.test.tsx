import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockCloudCodeApi = {
  listRepositories: jest.fn(),
  listBranches: jest.fn(),
  create: jest.fn(),
};
const mockOpenInAppBrowser = jest.fn();

jest.mock('@/lib/safeOpenURL', () => ({
  openInAppBrowser: (url: string) => mockOpenInAppBrowser(url),
}));

jest.mock('@/src/features/cloud-code/service', () => ({
  get cloudCodeApi() {
    return mockCloudCodeApi;
  },
  newCloudCodeIdempotencyKey: () => 'request-1',
  describeCloudCodeError: (_error: unknown, fallback: string) => fallback,
}));

import {
  NewCloudCodeSessionSheet,
  titleFromTask,
} from '@/src/features/cloud-code/components/NewCloudCodeSessionSheet';

const repository = {
  installationId: 7,
  owner: 'acme',
  name: 'app',
  fullName: 'acme/app',
  defaultBranch: 'main',
  isPrivate: true,
};

describe('new cloud code session', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockCloudCodeApi.listRepositories.mockResolvedValue({
      repositories: [repository],
      installationCount: 1,
      truncated: false,
      unreachable: [],
    });
    mockCloudCodeApi.listBranches.mockResolvedValue({
      branches: [
        { name: 'main', isProtected: true },
        { name: 'feature/login', isProtected: false },
      ],
      truncated: false,
    });
    mockOpenInAppBrowser.mockResolvedValue(true);
  });

  async function flushSearch() {
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
  }

  async function renderWithRepository(onCreated = jest.fn()) {
    const utils = render(
      <NewCloudCodeSessionSheet visible onClose={jest.fn()} onCreated={onCreated} />,
    );
    await flushSearch();
    await waitFor(() => utils.getByTestId('new-cloud-code-repo-acme/app'));
    fireEvent.changeText(utils.getByTestId('new-cloud-code-task'), 'Add a dark mode toggle');
    fireEvent.press(utils.getByTestId('new-cloud-code-repo-acme/app'));
    return utils;
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('titles a session from the first words of its task', () => {
    expect(titleFromTask('  fix the flaky login test in the auth suite please ')).toBe(
      'fix the flaky login test in',
    );
  });

  it('creates a session on the chosen repository and hands back the task', async () => {
    const session = { id: 'session-1', state: 'provisioning' };
    mockCloudCodeApi.create.mockResolvedValue({ session, terminalEntries: [] });
    const onCreated = jest.fn();
    const { getByTestId } = render(
      <NewCloudCodeSessionSheet visible onClose={jest.fn()} onCreated={onCreated} />,
    );

    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await waitFor(() => getByTestId('new-cloud-code-repo-acme/app'));

    fireEvent.changeText(getByTestId('new-cloud-code-task'), 'Add a dark mode toggle');
    fireEvent.press(getByTestId('new-cloud-code-repo-acme/app'));
    await act(async () => {
      fireEvent.press(getByTestId('new-cloud-code-start'));
    });

    expect(mockCloudCodeApi.create).toHaveBeenCalledWith({
      requestId: 'request-1',
      title: 'Add a dark mode toggle',
      repository: { installationId: 7, fullName: 'acme/app', branch: 'main' },
      networkAccess: 'trusted',
    });
    expect(onCreated).toHaveBeenCalledWith(session, 'Add a dark mode toggle');
  });

  it('does not start without a task', async () => {
    const { getByTestId } = render(
      <NewCloudCodeSessionSheet visible onClose={jest.fn()} onCreated={jest.fn()} />,
    );
    await act(async () => {
      fireEvent.press(getByTestId('new-cloud-code-start'));
    });
    expect(mockCloudCodeApi.create).not.toHaveBeenCalled();
  });

  it('loads branches for the chosen repository and sends the picked branch', async () => {
    const { getByTestId, getByLabelText } = await renderWithRepository();

    await waitFor(() => getByTestId('new-cloud-code-branch-feature/login'));
    expect(mockCloudCodeApi.listBranches).toHaveBeenCalledWith(
      { installationId: 7, fullName: 'acme/app' },
      expect.any(AbortSignal),
    );
    expect(getByLabelText('main, Default, Protected').props.accessibilityState).toEqual({
      checked: true,
    });

    fireEvent.press(getByTestId('new-cloud-code-branch-feature/login'));
    await act(async () => {
      fireEvent.press(getByTestId('new-cloud-code-start'));
    });

    expect(mockCloudCodeApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: { installationId: 7, fullName: 'acme/app', branch: 'feature/login' },
      }),
    );
  });

  it('aborts the branch request when the repository changes', async () => {
    mockCloudCodeApi.listBranches.mockReturnValue(new Promise(() => undefined));
    const { getByTestId } = await renderWithRepository();
    const signal = mockCloudCodeApi.listBranches.mock.calls[0][1] as AbortSignal;

    fireEvent.press(getByTestId('new-cloud-code-repo-none'));

    expect(signal.aborted).toBe(true);
  });

  it('uses a typed branch that the list does not include', async () => {
    const session = { id: 'session-1', state: 'provisioning' };
    mockCloudCodeApi.create.mockResolvedValue({ session, terminalEntries: [] });
    const { getByTestId, queryByTestId } = await renderWithRepository();
    await waitFor(() => getByTestId('new-cloud-code-branch-main'));

    fireEvent.changeText(getByTestId('new-cloud-code-branch-search'), 'release/2.0');
    expect(queryByTestId('new-cloud-code-branch-main')).toBeNull();
    fireEvent.press(getByTestId('new-cloud-code-branch-use-typed'));
    expect(getByTestId('new-cloud-code-branch-release/2.0').props.accessibilityState).toEqual({
      checked: true,
    });
    await act(async () => {
      fireEvent.press(getByTestId('new-cloud-code-start'));
    });

    expect(mockCloudCodeApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: { installationId: 7, fullName: 'acme/app', branch: 'release/2.0' },
      }),
    );
  });

  it('offers a retry when branches fail to load', async () => {
    mockCloudCodeApi.listBranches.mockRejectedValueOnce(new Error('boom'));
    const { getByText } = await renderWithRepository();

    await waitFor(() => getByText('Branches could not be loaded.'));
    await act(async () => {
      fireEvent.press(getByText('Retry'));
    });

    expect(mockCloudCodeApi.listBranches).toHaveBeenCalledTimes(2);
    await waitFor(() => getByText('feature/login'));
  });

  it('shows the truncated branch notice', async () => {
    mockCloudCodeApi.listBranches.mockResolvedValue({
      branches: [{ name: 'main', isProtected: false }],
      truncated: true,
    });
    const { getByText } = await renderWithRepository();

    await waitFor(() => getByText('Some branches are not listed. Type the full name to use one.'));
  });

  it('shows the truncated and unreachable repository notices', async () => {
    mockCloudCodeApi.listRepositories.mockResolvedValue({
      repositories: [repository],
      installationCount: 3,
      truncated: true,
      unreachable: [
        { installationId: 8, accountLogin: 'globex' },
        { installationId: 9, accountLogin: 'initech' },
      ],
    });
    const { getByText } = render(
      <NewCloudCodeSessionSheet visible onClose={jest.fn()} onCreated={jest.fn()} />,
    );
    await flushSearch();

    await waitFor(() => getByText('More repositories exist. Search to narrow the list.'));
    getByText('These installations could not be read: globex, initech');
  });

  it('offers to install the GitHub app when no installation exists', async () => {
    mockCloudCodeApi.listRepositories.mockResolvedValue({
      repositories: [],
      installationCount: 0,
      truncated: false,
      unreachable: [],
    });
    const { getByTestId, queryByLabelText } = render(
      <NewCloudCodeSessionSheet visible onClose={jest.fn()} onCreated={jest.fn()} />,
    );
    await flushSearch();

    await waitFor(() => getByTestId('new-cloud-code-first-run'));
    expect(queryByLabelText('Search repositories')).toBeNull();
    await act(async () => {
      fireEvent.press(getByTestId('new-cloud-code-install'));
    });
    expect(mockOpenInAppBrowser).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/github\/install\/start$/),
    );
    await flushSearch();
    expect(mockCloudCodeApi.listRepositories).toHaveBeenCalledTimes(2);
  });

  it('says the installed app reaches nothing when an unfiltered list is empty', async () => {
    mockCloudCodeApi.listRepositories.mockResolvedValue({
      repositories: [],
      installationCount: 1,
      truncated: false,
      unreachable: [],
    });
    const { getByText } = render(
      <NewCloudCodeSessionSheet visible onClose={jest.fn()} onCreated={jest.fn()} />,
    );
    await flushSearch();

    await waitFor(() =>
      getByText(
        'The installed app can reach no repositories yet. Give it access to one on GitHub.',
      ),
    );
  });
});
