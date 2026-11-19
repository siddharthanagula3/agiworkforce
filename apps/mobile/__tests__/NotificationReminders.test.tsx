/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';
import { requireAutoMode } from '../test-utils/modelFixtures';

const mockPush = jest.fn();
const mockFetchPreferenceNamespace = jest.fn();
const mockPatchPreferenceNamespace = jest.fn();
const mockApiGet = jest.fn();
const mockCreateSchedule = jest.fn();
const mockUpdateSchedule = jest.fn();
const mockToggleSchedule = jest.fn();
const mockDeleteSchedule = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
}));

jest.mock('@/services/notifications', () => ({
  enablePushNotifications: jest.fn().mockResolvedValue('granted'),
  getPushDeliveryStatus: jest.fn().mockResolvedValue('granted'),
  getPushRegistrationIssue: jest.fn().mockReturnValue(null),
  useNotificationCenter: () => ({ unreadCount: 0 }),
}));

jest.mock('@/services/notificationChannels', () => ({
  androidChannelVibrates: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/services/preferences', () => ({
  fetchPreferenceNamespace: (...args: unknown[]) => mockFetchPreferenceNamespace(...args),
  savePreferenceNamespace: jest.fn().mockResolvedValue(undefined),
  patchPreferenceNamespace: (...args: unknown[]) => mockPatchPreferenceNamespace(...args),
}));

jest.mock('@/services/api', () => ({
  api: { get: (...args: unknown[]) => mockApiGet(...args) },
}));

jest.mock('@/src/features/schedules/service', () => ({
  createSchedule: (...args: unknown[]) => mockCreateSchedule(...args),
  updateSchedule: (...args: unknown[]) => mockUpdateSchedule(...args),
  toggleSchedule: (...args: unknown[]) => mockToggleSchedule(...args),
  deleteSchedule: (...args: unknown[]) => mockDeleteSchedule(...args),
  fetchSchedules: jest.fn().mockResolvedValue([]),
  fetchScheduleRuns: jest.fn().mockResolvedValue([]),
  resolveScheduleRunApproval: jest.fn(),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('lucide-react-native', () => {
  const icon = () => null;
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : icon) });
});

import '@/src/i18n';
import { ApiHttpError } from '../services/apiErrors';
import NotificationPreferencesScreen from '../src/features/settings/notifications';
import { ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE } from '../src/features/settings/notifications/useAgentActivityPushSync';
import {
  CLOUD_REMINDERS_LOAD_FAILED,
  DAILY_BRIEF_LOAD_FAILED,
  USAGE_RESET_PUSH_PREFERENCE_KEY,
} from '../src/features/settings/notifications/useCloudReminders';
import {
  DAILY_BRIEF_SCHEDULE_PREFERENCE_KEY,
  DAILY_BRIEF_SETUP_FAILED,
} from '../src/features/settings/notifications/dailyBrief';
import { deviceTimezone, useNotificationPrefsStore } from '../stores/notificationPrefsStore';
import { useAuthStore } from '../src/features/auth/store';
import { useTierStore } from '../src/features/billing/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const OWNER = 'reminders-owner';
const ORGANIZATION = { id: '11111111-1111-4111-8111-111111111111', name: 'Acme', slug: 'acme' };
const SCHEDULE_PATH = '/api/schedules/brief-1';
const WORKSPACE_OVERVIEW_PATH = '/api/settings/organization';
const NO_SELECTOR = 'active';

type ScheduleRead = 'found' | 'missing' | 'failing';

function missingSchedule() {
  return new ApiHttpError('Schedule not found', 404);
}

function routeApi(reads: Record<string, ScheduleRead>, memberships = [ORGANIZATION]) {
  mockApiGet.mockImplementation((path: string, options?: { headers?: Record<string, string> }) => {
    if (path === WORKSPACE_OVERVIEW_PATH) {
      return Promise.resolve({
        access: { plan: 'pro', canManageTeam: false, maxMembers: null },
        activeOrganizationId: null,
        workspaces: memberships.map((membership) => ({ ...membership, role: 'member' })),
        organization: null,
      });
    }
    if (path !== SCHEDULE_PATH) return Promise.reject(new Error(`unexpected path ${path}`));
    const read = reads[options?.headers?.[MANAGED_CLOUD_ORGANIZATION_HEADER] ?? NO_SELECTOR];
    if (read === 'found') return Promise.resolve({ schedule: serverSchedule() });
    if (read === 'failing') return Promise.reject(new ApiHttpError('Unavailable', 503));
    return Promise.reject(missingSchedule());
  });
}

function scheduleReadSelectors(): string[] {
  return mockApiGet.mock.calls
    .filter(([path]) => path === SCHEDULE_PATH)
    .map(([, options]) => options?.headers?.[MANAGED_CLOUD_ORGANIZATION_HEADER] ?? NO_SELECTOR);
}

function elsewhereNote(name: string) {
  return `Your daily brief runs in ${name}. Switch to that workspace to change it.`;
}
const AUTO_MODEL_ID = requireAutoMode().id;

function storedNotifications(value: Record<string, unknown>) {
  mockFetchPreferenceNamespace.mockImplementation((namespace: string) =>
    Promise.resolve(namespace === ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE ? value : {}),
  );
}

function serverSchedule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'brief-1',
    userId: OWNER,
    name: 'Daily brief',
    description: null,
    scheduleType: 'cron',
    cronExpression: '30 7 * * *',
    executeAt: null,
    intervalMs: null,
    timezone: 'UTC',
    isEnabled: true,
    expiresAt: null,
    maxExecutions: null,
    executionCount: 0,
    actionType: 'agent',
    actionConfig: null,
    prompt: 'Give me a brief for today.',
    model: AUTO_MODEL_ID,
    status: 'active',
    lastExecutedAt: null,
    nextExecutionAt: null,
    lastError: null,
    metadata: { productRecurrence: 'daily', timeOfDay: '07:30' },
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

function signInToCloud() {
  activateCloudAccount(OWNER);
  act(() => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: OWNER });
  });
}

describe('notification reminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    storedNotifications({});
    mockPatchPreferenceNamespace.mockResolvedValue(undefined);
    act(() => {
      useTierStore.setState({ tier: 'pro' });
      useChatAppModeStore.setState({ appMode: 'local' });
      useAuthStore.setState({ isClerkLoaded: false, isClerkSignedIn: false, clerkUserId: null });
      useNotificationPrefsStore.setState({
        categoryEnabled: {
          chat_replies: true,
          tasks: true,
          scheduled_tasks: true,
          product_updates: false,
          product: false,
          usage_resets: true,
        },
      });
    });
  });

  afterEach(() => {
    act(() => {
      useChatAppModeStore.setState({ appMode: 'local' });
      useAuthStore.setState({ isClerkLoaded: false, isClerkSignedIn: false, clerkUserId: null });
      useTierStore.setState({ tier: 'free' });
    });
  });

  it('opens the Cloud gate from the daily brief in Local mode and reads nothing', () => {
    const screen = render(<NotificationPreferencesScreen />);

    expect(screen.getByLabelText('Usage limit resets').props.disabled).toBe(true);
    expect(screen.getByText('Switch to AGI Cloud to use these reminders.')).toBeTruthy();
    fireEvent(screen.getByLabelText('Daily brief'), 'valueChange', true);

    expect(mockPush).toHaveBeenCalledWith('/(app)/schedules');
    expect(mockCreateSchedule).not.toHaveBeenCalled();
    expect(mockFetchPreferenceNamespace).not.toHaveBeenCalledWith(
      ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE,
      expect.anything(),
    );
  });

  it('reads and writes the account usage reset switch and mirrors it on this device', async () => {
    storedNotifications({ [USAGE_RESET_PUSH_PREFERENCE_KEY]: false });
    signInToCloud();
    const screen = render(<NotificationPreferencesScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText('Usage limit resets').props.disabled).toBe(false);
    });
    expect(screen.getByLabelText('Usage limit resets').props.value).toBe(false);
    expect(useNotificationPrefsStore.getState().categoryEnabled.usage_resets).toBe(false);

    await act(async () => {
      fireEvent(screen.getByLabelText('Usage limit resets'), 'valueChange', true);
    });

    expect(mockPatchPreferenceNamespace).toHaveBeenCalledWith(
      ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE,
      { [USAGE_RESET_PUSH_PREFERENCE_KEY]: true },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByLabelText('Usage limit resets').props.value).toBe(true);
    expect(useNotificationPrefsStore.getState().categoryEnabled.usage_resets).toBe(true);
  });

  it('puts the usage reset switch back when the account does not save it', async () => {
    signInToCloud();
    mockPatchPreferenceNamespace.mockRejectedValueOnce(new Error('offline'));
    const screen = render(<NotificationPreferencesScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('Usage limit resets').props.disabled).toBe(false);
    });

    await act(async () => {
      fireEvent(screen.getByLabelText('Usage limit resets'), 'valueChange', false);
    });

    expect(screen.getByLabelText('Usage limit resets').props.value).toBe(true);
    expect(screen.getByText('Could not save usage limit reset alerts. Try again.')).toBeTruthy();
  });

  it('asks for a time, then creates one daily schedule and remembers it on the account', async () => {
    signInToCloud();
    mockCreateSchedule.mockResolvedValueOnce({
      id: 'brief-1',
      isActive: true,
      timeOfDay: '08:00',
    });
    const screen = render(<NotificationPreferencesScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('Daily brief').props.disabled).toBe(false);
    });

    fireEvent(screen.getByLabelText('Daily brief'), 'valueChange', true);
    expect(screen.getByText('Daily Brief Time')).toBeTruthy();
    expect(screen.getByLabelText('Daily brief time').props.value).toBe('08:00');
    expect(mockCreateSchedule).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Set Time'));
    });

    expect(mockCreateSchedule).toHaveBeenCalledTimes(1);
    expect(mockCreateSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Daily brief',
        model: AUTO_MODEL_ID,
        recurrence: 'daily',
        timeOfDay: '08:00',
        timezone: deviceTimezone(),
        isActive: true,
        connectors: null,
        prompt: expect.stringContaining('calendar'),
      }),
    );
    expect(mockPatchPreferenceNamespace).toHaveBeenCalledWith(
      ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE,
      { [DAILY_BRIEF_SCHEDULE_PREFERENCE_KEY]: 'brief-1' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByLabelText('Daily brief').props.value).toBe(true);
    expect(screen.getByLabelText('Daily brief time, 08:00')).toBeTruthy();
    expect(screen.getByText('Each brief counts toward your usage limits.')).toBeTruthy();
  });

  it('returns the switch to off when the schedule cannot be created', async () => {
    signInToCloud();
    mockCreateSchedule.mockRejectedValueOnce(new Error('quota'));
    const screen = render(<NotificationPreferencesScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('Daily brief').props.disabled).toBe(false);
    });

    fireEvent(screen.getByLabelText('Daily brief'), 'valueChange', true);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Set Time'));
    });

    expect(screen.getByLabelText('Daily brief').props.value).toBe(false);
    expect(screen.getByText(DAILY_BRIEF_SETUP_FAILED)).toBeTruthy();
    expect(mockPatchPreferenceNamespace).not.toHaveBeenCalled();
  });

  it('removes the new schedule again when the account cannot remember it', async () => {
    signInToCloud();
    mockCreateSchedule.mockResolvedValueOnce({ id: 'brief-2', isActive: true, timeOfDay: '08:00' });
    mockPatchPreferenceNamespace.mockRejectedValueOnce(new Error('offline'));
    mockDeleteSchedule.mockResolvedValueOnce(undefined);
    const screen = render(<NotificationPreferencesScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('Daily brief').props.disabled).toBe(false);
    });

    fireEvent(screen.getByLabelText('Daily brief'), 'valueChange', true);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Set Time'));
    });

    expect(mockDeleteSchedule).toHaveBeenCalledWith('brief-2');
    expect(screen.getByLabelText('Daily brief').props.value).toBe(false);
    expect(screen.getByText(DAILY_BRIEF_SETUP_FAILED)).toBeTruthy();
  });

  it('shows a stored brief as on and pauses it when switched off', async () => {
    storedNotifications({ [DAILY_BRIEF_SCHEDULE_PREFERENCE_KEY]: 'brief-1' });
    mockApiGet.mockResolvedValueOnce({ schedule: serverSchedule() });
    mockToggleSchedule.mockResolvedValueOnce({
      id: 'brief-1',
      isActive: false,
      timeOfDay: '07:30',
    });
    signInToCloud();
    const screen = render(<NotificationPreferencesScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText('Daily brief').props.value).toBe(true);
    });
    expect(mockApiGet).toHaveBeenCalledWith('/api/schedules/brief-1', expect.anything());
    expect(screen.getByLabelText('Daily brief time, 07:30')).toBeTruthy();

    await act(async () => {
      fireEvent(screen.getByLabelText('Daily brief'), 'valueChange', false);
    });

    expect(mockToggleSchedule).toHaveBeenCalledWith('brief-1', false);
    expect(mockCreateSchedule).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Daily brief').props.value).toBe(false);
  });

  it('resumes the paused brief at the new time instead of creating another', async () => {
    storedNotifications({ [DAILY_BRIEF_SCHEDULE_PREFERENCE_KEY]: 'brief-1' });
    mockApiGet.mockResolvedValueOnce({
      schedule: serverSchedule({ isEnabled: false, status: 'paused' }),
    });
    mockUpdateSchedule.mockResolvedValueOnce({ id: 'brief-1', isActive: true, timeOfDay: '09:00' });
    signInToCloud();
    const screen = render(<NotificationPreferencesScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('Daily brief').props.disabled).toBe(false);
    });
    expect(screen.getByLabelText('Daily brief').props.value).toBe(false);

    fireEvent(screen.getByLabelText('Daily brief'), 'valueChange', true);
    fireEvent.press(screen.getByLabelText('Set time to 09:00'));
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Set Time'));
    });

    expect(mockUpdateSchedule).toHaveBeenCalledWith('brief-1', {
      timeOfDay: '09:00',
      timezone: deviceTimezone(),
      isActive: true,
    });
    expect(mockCreateSchedule).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Daily brief').props.value).toBe(true);
  });

  it('keeps the usage reset switch usable when only the daily brief fails to load', async () => {
    storedNotifications({
      [USAGE_RESET_PUSH_PREFERENCE_KEY]: false,
      [DAILY_BRIEF_SCHEDULE_PREFERENCE_KEY]: 'brief-1',
    });
    mockApiGet.mockRejectedValueOnce(new Error('timeout'));
    signInToCloud();
    const screen = render(<NotificationPreferencesScreen />);

    await waitFor(() => {
      expect(screen.getByText(DAILY_BRIEF_LOAD_FAILED)).toBeTruthy();
    });
    expect(screen.getByLabelText('Usage limit resets').props.disabled).toBe(false);
    expect(screen.getByLabelText('Usage limit resets').props.value).toBe(false);
    expect(screen.getByLabelText('Daily brief').props.disabled).toBe(true);
    expect(screen.queryByText(CLOUD_REMINDERS_LOAD_FAILED)).toBeNull();

    mockApiGet.mockResolvedValueOnce({ schedule: serverSchedule() });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Retry reminders'));
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Daily brief').props.value).toBe(true);
    });
    expect(screen.getByLabelText('Daily brief').props.disabled).toBe(false);
    expect(screen.queryByText(DAILY_BRIEF_LOAD_FAILED)).toBeNull();
  });

  it('does not offer a daily brief to a plan without scheduled tasks', async () => {
    act(() => {
      useTierStore.setState({ tier: 'free' });
    });
    signInToCloud();
    const screen = render(<NotificationPreferencesScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText('Usage limit resets').props.disabled).toBe(false);
    });
    expect(screen.queryByLabelText('Daily brief')).toBeNull();
  });

  describe('a brief saved from another workspace', () => {
    beforeEach(() => {
      storedNotifications({ [DAILY_BRIEF_SCHEDULE_PREFERENCE_KEY]: 'brief-1' });
    });

    afterEach(() => {
      mockApiGet.mockReset();
      mockUpdateSchedule.mockReset();
    });

    it('locks the switch and names Personal when the brief runs there', async () => {
      routeApi({ [MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE]: 'found' });
      signInToCloud();
      const screen = render(<NotificationPreferencesScreen />);

      await waitFor(() => {
        expect(screen.getByText(elsewhereNote('Personal'))).toBeTruthy();
      });
      expect(screen.getByLabelText('Daily brief').props.value).toBe(false);
      expect(screen.getByLabelText('Daily brief').props.disabled).toBe(true);
      expect(scheduleReadSelectors()).toEqual([
        NO_SELECTOR,
        MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
      ]);
      expect(mockCreateSchedule).not.toHaveBeenCalled();
      expect(mockPatchPreferenceNamespace).not.toHaveBeenCalled();
    });

    it('names the organization when the brief runs there', async () => {
      routeApi({ [ORGANIZATION.id]: 'found' });
      signInToCloud();
      const screen = render(<NotificationPreferencesScreen />);

      await waitFor(() => {
        expect(screen.getByText(elsewhereNote(ORGANIZATION.name))).toBeTruthy();
      });
      expect(screen.getByLabelText('Daily brief').props.disabled).toBe(true);
      expect(scheduleReadSelectors()).toEqual([
        NO_SELECTOR,
        MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
        ORGANIZATION.id,
      ]);
      expect(mockCreateSchedule).not.toHaveBeenCalled();
    });

    it('creates a new brief when no workspace has the saved one', async () => {
      routeApi({});
      mockCreateSchedule.mockResolvedValueOnce({
        id: 'brief-2',
        isActive: true,
        timeOfDay: '08:00',
      });
      signInToCloud();
      const screen = render(<NotificationPreferencesScreen />);

      await waitFor(() => {
        expect(screen.getByLabelText('Daily brief').props.disabled).toBe(false);
      });
      expect(screen.getByLabelText('Daily brief').props.value).toBe(false);
      expect(scheduleReadSelectors()).toEqual([
        NO_SELECTOR,
        MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
        ORGANIZATION.id,
      ]);
      expect(screen.queryByText(/Your daily brief runs in/)).toBeNull();

      fireEvent(screen.getByLabelText('Daily brief'), 'valueChange', true);
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Set Time'));
      });

      expect(mockCreateSchedule).toHaveBeenCalledTimes(1);
      expect(mockPatchPreferenceNamespace).toHaveBeenCalledWith(
        ACCOUNT_NOTIFICATION_PREFERENCES_NAMESPACE,
        { [DAILY_BRIEF_SCHEDULE_PREFERENCE_KEY]: 'brief-2' },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(screen.getByLabelText('Daily brief').props.value).toBe(true);
    });

    it('does not probe when the account has no organizations', async () => {
      routeApi({ [MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE]: 'found' }, []);
      signInToCloud();
      const screen = render(<NotificationPreferencesScreen />);

      await waitFor(() => {
        expect(screen.getByLabelText('Daily brief').props.disabled).toBe(false);
      });
      expect(screen.getByLabelText('Daily brief').props.value).toBe(false);
      expect(scheduleReadSelectors()).toEqual([NO_SELECTOR]);
      expect(mockApiGet).toHaveBeenCalledWith(WORKSPACE_OVERVIEW_PATH, expect.anything());
      expect(screen.queryByText(/Your daily brief runs in/)).toBeNull();
    });

    it('does not create a second brief when the loaded one moved out of reach', async () => {
      routeApi({ [NO_SELECTOR]: 'found' });
      signInToCloud();
      const screen = render(<NotificationPreferencesScreen />);
      await waitFor(() => {
        expect(screen.getByLabelText('Daily brief').props.value).toBe(true);
      });

      routeApi({ [ORGANIZATION.id]: 'found' });
      mockUpdateSchedule.mockRejectedValueOnce(missingSchedule());
      fireEvent.press(screen.getByLabelText('Daily brief time, 07:30'));
      fireEvent.press(screen.getByLabelText('Set time to 09:00'));
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Set Time'));
      });

      expect(mockUpdateSchedule).toHaveBeenCalledTimes(1);
      expect(mockCreateSchedule).not.toHaveBeenCalled();
      expect(mockPatchPreferenceNamespace).not.toHaveBeenCalled();
      expect(screen.getByText(elsewhereNote(ORGANIZATION.name))).toBeTruthy();
      expect(screen.getByLabelText('Daily brief').props.value).toBe(false);
      expect(screen.getByLabelText('Daily brief').props.disabled).toBe(true);
    });

    it('fails closed when a workspace cannot be checked', async () => {
      routeApi({ [MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE]: 'failing' });
      signInToCloud();
      const screen = render(<NotificationPreferencesScreen />);

      await waitFor(() => {
        expect(screen.getByText(DAILY_BRIEF_LOAD_FAILED)).toBeTruthy();
      });
      expect(screen.getByLabelText('Daily brief').props.disabled).toBe(true);
      expect(scheduleReadSelectors()).toEqual([
        NO_SELECTOR,
        MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
      ]);
      expect(mockCreateSchedule).not.toHaveBeenCalled();
      expect(mockPatchPreferenceNamespace).not.toHaveBeenCalled();
    });
  });
});
