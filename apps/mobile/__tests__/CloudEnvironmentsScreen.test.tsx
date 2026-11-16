/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert, Modal } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { CloudCodeApiError } from '@agiworkforce/cloud-contracts';
import type { CloudCodeEnvironment } from '@agiworkforce/types';

const mockAccess = { ready: true, signedIn: true, activate: jest.fn() };
const mockApi = {
  listEnvironments: jest.fn(),
  updateEnvironment: jest.fn(),
  deleteEnvironment: jest.fn(),
};
const mockSwipeClose = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : Icon) });
});

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return {
    ...jest.requireActual('react-native-gesture-handler'),
    Swipeable: ({
      children,
      renderRightActions,
    }: {
      children: React.ReactNode;
      renderRightActions?: (
        progress: unknown,
        drag: unknown,
        swipeable: unknown,
      ) => React.ReactNode;
    }) => (
      <View>
        {children}
        {renderRightActions?.(null, null, { close: mockSwipeClose })}
      </View>
    ),
  };
});

jest.mock('@/src/features/cloud-code/useCloudCodeAccess', () => ({
  useCloudCodeAccess: () => ({
    ready: mockAccess.ready,
    signedIn: mockAccess.signedIn,
    accountKey: 'user_test',
    activate: mockAccess.activate,
  }),
}));

jest.mock('@/src/features/cloud-code/service', () => ({
  CLOUD_CODE_LIST_ERROR: 'Cloud sessions could not be loaded',
  CLOUD_CODE_OPEN_ERROR: 'This session could not be opened',
  CLOUD_CODE_SEND_ERROR: 'Your message could not be sent',
  CLOUD_CODE_STOP_ERROR: 'The task could not be stopped',
  CLOUD_CODE_DECISION_ERROR: 'Your decision could not be sent',
  CLOUD_CODE_UNARCHIVE_ERROR: 'This session could not be unarchived',
  get cloudCodeApi() {
    return mockApi;
  },
  newCloudCodeIdempotencyKey: () => 'request-1',
  isMissingCloudCodeSession: () => false,
  describeCloudCodeError: (_error: unknown, fallback: string) => fallback,
}));

import CloudEnvironmentsScreen from '@/app/(app)/settings/code-environments/index';

function environment(overrides: Partial<CloudCodeEnvironment>): CloudCodeEnvironment {
  return {
    id: '0190a000-0000-7000-8000-000000000001',
    name: 'Web app',
    networkAccess: 'trusted',
    extraHosts: [],
    allowPackageManagers: true,
    setupScript: '',
    variableNames: [],
    isDefault: false,
    createdAt: '2026-11-16T10:00:00.000Z',
    updatedAt: '2026-11-16T10:00:00.000Z',
    ...overrides,
  };
}

const WEB = environment({
  setupScript: 'npm install',
  variableNames: ['API_TOKEN', 'DATABASE_URL'],
});
const DOCS = environment({
  id: '0190a000-0000-7000-8000-000000000002',
  name: 'Docs',
  networkAccess: 'none',
  variableNames: ['TOKEN'],
  isDefault: true,
});

function listed(environments: CloudCodeEnvironment[]) {
  mockApi.listEnvironments.mockResolvedValue({ environments, limit: 20 });
}

function row(id: string) {
  return screen.getByTestId(`cloud-environment-${id}`);
}

function openMenu(id: string) {
  fireEvent(row(id), 'longPress');
}

function chooseMenuAction(key: string) {
  const menu = screen
    .UNSAFE_getAllByType(Modal)
    .find((modal) => modal.props.visible && modal.props.onDismiss);
  fireEvent.press(screen.getByTestId(`conversation-action-${key}`));
  act(() => menu?.props.onDismiss());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAccess.ready = true;
  mockAccess.signedIn = true;
});

describe('Cloud environments screen', () => {
  it('shows the built-in Default with the check when no saved environment is the default', async () => {
    listed([WEB]);

    render(<CloudEnvironmentsScreen />);

    expect(await screen.findByText('Web app')).toBeTruthy();
    expect(screen.getByText('Cloud environments')).toBeTruthy();
    expect(screen.getByText('Default')).toBeTruthy();
    expect(screen.getByText('Trusted hosts')).toBeTruthy();
    expect(screen.getByText('Trusted hosts · setup script · 2 variables')).toBeTruthy();
    expect(screen.getByTestId('cloud-environment-built-in').props.accessibilityState).toMatchObject(
      {
        selected: true,
      },
    );
    expect(row(WEB.id).props.accessibilityState).toMatchObject({ selected: false });
  });

  it('moves the check to a saved default and names one variable in the singular', async () => {
    listed([DOCS, WEB]);

    render(<CloudEnvironmentsScreen />);

    expect(await screen.findByText('Isolated · 1 variable')).toBeTruthy();
    expect(row(DOCS.id).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('cloud-environment-built-in').props.accessibilityState).toMatchObject(
      {
        selected: false,
      },
    );
  });

  it('lists only the built-in Default when nothing is saved, with nothing to do on it', async () => {
    listed([]);

    render(<CloudEnvironmentsScreen />);

    await waitFor(() => expect(screen.getByText('Default')).toBeTruthy());
    const builtIn = screen.getByTestId('cloud-environment-built-in');
    expect(builtIn.props.accessibilityActions).toEqual([]);
    fireEvent(builtIn, 'longPress');
    expect(screen.queryByTestId('conversation-action-setDefault')).toBeNull();
    expect(screen.queryByTestId('environment-swipe-setDefault')).toBeNull();
  });

  it('says the feature is not available when the server has no environments route', async () => {
    mockApi.listEnvironments.mockRejectedValue(new CloudCodeApiError('Not found', 404));

    render(<CloudEnvironmentsScreen />);

    expect(await screen.findByTestId('cloud-environments-unavailable')).toBeTruthy();
    expect(screen.queryByText('Default')).toBeNull();
    expect(screen.queryByTestId('cloud-environments-retry')).toBeNull();
  });

  it('offers a retry when the list fails and loads it again', async () => {
    mockApi.listEnvironments.mockRejectedValueOnce(new CloudCodeApiError('Boom', 500));
    listed([WEB]);

    render(<CloudEnvironmentsScreen />);

    const retry = await screen.findByTestId('cloud-environments-retry');
    expect(within(retry).getByText(/Environments could not be loaded\./)).toBeTruthy();
    expect(within(retry).getByText('Try again')).toBeTruthy();
    fireEvent.press(retry);

    expect(await screen.findByText('Web app')).toBeTruthy();
    expect(mockApi.listEnvironments).toHaveBeenCalledTimes(2);
  });

  it('sets a saved environment as the default from the long-press menu', async () => {
    listed([DOCS, WEB]);
    mockApi.updateEnvironment.mockResolvedValue({ ...WEB, isDefault: true });
    render(<CloudEnvironmentsScreen />);
    await screen.findByText('Web app');

    openMenu(WEB.id);
    expect(screen.getByTestId('conversation-action-delete')).toBeTruthy();
    chooseMenuAction('setDefault');

    await waitFor(() =>
      expect(row(WEB.id).props.accessibilityState).toMatchObject({ selected: true }),
    );
    expect(mockApi.updateEnvironment).toHaveBeenCalledWith(WEB.id, { isDefault: true });
    expect(row(DOCS.id).props.accessibilityState).toMatchObject({ selected: false });
  });

  it('gives the default back to the built-in environment', async () => {
    listed([DOCS]);
    mockApi.updateEnvironment.mockResolvedValue({ ...DOCS, isDefault: false });
    render(<CloudEnvironmentsScreen />);
    await screen.findByText('Docs');

    openMenu('built-in');
    expect(screen.queryByTestId('conversation-action-delete')).toBeNull();
    chooseMenuAction('setDefault');

    await waitFor(() =>
      expect(
        screen.getByTestId('cloud-environment-built-in').props.accessibilityState,
      ).toMatchObject({ selected: true }),
    );
    expect(mockApi.updateEnvironment).toHaveBeenCalledWith(DOCS.id, { isDefault: false });
  });

  it('asks before deleting, names the consequence, and removes the row', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    listed([WEB]);
    mockApi.deleteEnvironment.mockResolvedValue(undefined);
    render(<CloudEnvironmentsScreen />);
    await screen.findByText('Web app');

    openMenu(WEB.id);
    chooseMenuAction('delete');

    expect(mockApi.deleteEnvironment).not.toHaveBeenCalled();
    const [title, message, buttons] = alert.mock.calls[0]!;
    expect(title).toBe('Delete Web app?');
    expect(message).toContain('removed for good');
    expect(message).toContain('Sessions that are already running are not affected.');
    const confirm = buttons?.find((button) => button.style === 'destructive');
    await act(async () => confirm?.onPress?.());

    expect(mockApi.deleteEnvironment).toHaveBeenCalledWith(WEB.id);
    expect(screen.queryByText('Web app')).toBeNull();
    alert.mockRestore();
  });

  it('keeps the row and says so when the delete fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    listed([WEB]);
    mockApi.deleteEnvironment.mockRejectedValue(new CloudCodeApiError('Boom', 500));
    render(<CloudEnvironmentsScreen />);
    await screen.findByText('Web app');

    openMenu(WEB.id);
    chooseMenuAction('delete');
    const confirm = alert.mock.calls[0]?.[2]?.find((button) => button.style === 'destructive');
    await act(async () => confirm?.onPress?.());

    expect(await screen.findByText('The environment could not be deleted')).toBeTruthy();
    expect(screen.getByText('Web app')).toBeTruthy();
    alert.mockRestore();
  });

  it('offers the same actions to VoiceOver and TalkBack', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    listed([WEB]);
    render(<CloudEnvironmentsScreen />);
    await screen.findByText('Web app');

    expect(row(WEB.id).props.accessibilityLabel).toBe(
      'Web app. Trusted hosts · setup script · 2 variables',
    );
    expect(row(WEB.id).props.accessibilityActions).toEqual([
      { name: 'setDefault', label: 'Set as default' },
      { name: 'delete', label: 'Delete' },
    ]);
    fireEvent(row(WEB.id), 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });

    expect(alert).toHaveBeenCalledWith('Delete Web app?', expect.any(String), expect.any(Array));
    alert.mockRestore();
  });

  it('runs a swipe action and closes the swiped row', async () => {
    listed([WEB]);
    mockApi.updateEnvironment.mockResolvedValue({ ...WEB, isDefault: true });
    render(<CloudEnvironmentsScreen />);
    await screen.findByText('Web app');

    fireEvent.press(screen.getByTestId('environment-swipe-setDefault'));

    expect(mockSwipeClose).toHaveBeenCalled();
    await waitFor(() =>
      expect(row(WEB.id).props.accessibilityState).toMatchObject({ selected: true }),
    );
  });

  it('asks a signed-in person in Local Mode to switch to AGI Cloud without loading', () => {
    mockAccess.ready = false;

    render(<CloudEnvironmentsScreen />);

    expect(screen.getByText('Switch to AGI Cloud to manage cloud environments.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Switch to AGI Cloud'));
    expect(mockAccess.activate).toHaveBeenCalled();
    expect(mockApi.listEnvironments).not.toHaveBeenCalled();
  });

  it('asks a signed-out person to sign in without loading', () => {
    mockAccess.ready = false;
    mockAccess.signedIn = false;

    render(<CloudEnvironmentsScreen />);

    expect(screen.getByLabelText('Sign in to AGI Cloud')).toBeTruthy();
    expect(mockApi.listEnvironments).not.toHaveBeenCalled();
  });
});
