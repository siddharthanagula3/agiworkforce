jest.mock('@/src/features/billing/nativePurchaseAvailability', () => ({
  NATIVE_PURCHASES_AVAILABLE: true,
}));
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Platform, ScrollView, StyleSheet } from 'react-native';
import { HEADER_TEXT_SCALE_LIMIT } from '@/src/features/chat/components/WorkModeSwitch';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockFetchSchedules = jest.fn(async () => undefined);

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: jest.fn(() => true),
  }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../src/features/voice/components/VoiceInputButton', () => ({
  VoiceInputButton: ({ onTranscription }: { onTranscription: (text: string) => void }) => {
    const { Pressable, Text } = jest.requireActual('react-native');
    return (
      <Pressable
        accessibilityLabel="Dictate scheduled task"
        onPress={() => onTranscription('Summarize my inbox')}
      >
        <Text>Mic</Text>
      </Pressable>
    );
  },
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return {
    ArrowLeft: icon,
    ArrowUp: icon,
    Calendar: icon,
    ChevronDown: icon,
    ChevronRight: icon,
    ChevronUp: icon,
    CircleHelp: icon,
    Clock: icon,
    Cloud: icon,
    Pause: icon,
    Play: icon,
    ListFilter: icon,
    MoreHorizontal: icon,
    Plus: icon,
    Trash2: icon,
    X: icon,
    Zap: icon,
  };
});

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { hapticsEnabled: boolean }) => unknown) =>
    selector({ hapticsEnabled: false }),
}));

import SchedulesScreen from '../app/(app)/schedules';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useScheduleStore } from '../src/features/schedules/store';
import { useTierStore } from '../src/features/billing/store';
import { zonedDateAndTimeToIso } from '../src/features/schedules/timing';
import { describeScheduleDeletion } from '../src/features/schedules/deleteConfirmation';

describe('Schedules screen Cloud boundary', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchSchedules.mockResolvedValue(undefined);
    useChatAppModeStore.setState({ appMode: 'local' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'basic' });
    useScheduleStore.setState({
      schedules: [],
      runs: {},
      loading: false,
      error: null,
      fetchSchedules: mockFetchSchedules,
    });
  });

  it('does not fetch Cloud schedules while Local Mode is active', () => {
    const { getByText, getByLabelText } = render(<SchedulesScreen />);

    expect(getByText('Schedules run in AGI Cloud')).toBeTruthy();
    expect(getByLabelText('Switch to AGI Cloud')).toBeTruthy();
    expect(mockFetchSchedules).not.toHaveBeenCalled();
  });

  it('uses the full-size primary action treatment for the Cloud boundary', () => {
    useWaitlistStore.setState({ cloudUnlocked: false });
    const { getByLabelText } = render(<SchedulesScreen />);
    const action = getByLabelText('Sign in to AGI Cloud');
    expect(typeof action.props.style).not.toBe('function');
    const actionStyle = StyleSheet.flatten(
      typeof action.props.style === 'function'
        ? action.props.style({ pressed: false })
        : action.props.style,
    );

    expect(action.props.className).toBeUndefined();
    expect(actionStyle.alignItems).toBe('center');
    expect(actionStyle.justifyContent).toBe('center');
    expect(actionStyle.minHeight).toBe(52);
    expect(actionStyle.backgroundColor).toBeTruthy();
  });

  it('fetches only after a signed-in user explicitly switches to Cloud', async () => {
    const { getByLabelText } = render(<SchedulesScreen />);

    fireEvent.press(getByLabelText('Switch to AGI Cloud'));

    await waitFor(() => {
      expect(useChatAppModeStore.getState().appMode).toBe('cloud');
      expect(mockFetchSchedules).toHaveBeenCalledTimes(1);
    });
  });

  it('routes signed-out users to Cloud sign-in without changing modes', () => {
    useWaitlistStore.setState({ cloudUnlocked: false });
    const { getByLabelText } = render(<SchedulesScreen />);

    fireEvent.press(getByLabelText('Sign in to AGI Cloud'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(auth)/login',
      params: { postAuthIntent: 'cloud-schedules' },
    });
    expect(useChatAppModeStore.getState().appMode).toBe('local');
    expect(mockFetchSchedules).not.toHaveBeenCalled();
  });

  it('loads schedules immediately when the route opens in Cloud mode', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { getByText, getByLabelText } = render(<SchedulesScreen />);

    expect(getByText('No Schedules')).toBeTruthy();
    expect(getByText('Try a template')).toBeTruthy();
    expect(getByLabelText('Use Daily briefing template')).toBeTruthy();
    expect(getByLabelText('Schedule a task')).toBeTruthy();
    await waitFor(() => expect(mockFetchSchedules).toHaveBeenCalledTimes(1));
  });

  it('keeps a dictated task in the pinned composer and opens scheduling details', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { getByLabelText, getAllByDisplayValue, getAllByLabelText } = render(<SchedulesScreen />);

    fireEvent.press(getByLabelText('Dictate scheduled task'));
    expect(getAllByDisplayValue('Summarize my inbox').length).toBe(1);
    fireEvent.press(getByLabelText('Continue scheduling task'));
    expect(getAllByLabelText('Create schedule').length).toBeGreaterThan(1);
    expect(getAllByDisplayValue('Summarize my inbox').length).toBe(2);
  });

  it('opens the full schedule form from the composer', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { getByLabelText } = render(<SchedulesScreen />);

    fireEvent.press(getByLabelText('Open detailed schedule form'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(app)/schedules/create' });
  });

  it('opens the create form with only an allowlisted template ID', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { getByLabelText } = render(<SchedulesScreen />);

    fireEvent.press(getByLabelText('Use Meeting prep template'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/schedules/create',
      params: { template: 'meeting-prep' },
    });
  });

  it('does not contact Cloud when a signed-out session has stale Cloud mode state', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: false });

    const { getByLabelText } = render(<SchedulesScreen />);

    expect(getByLabelText('Sign in to AGI Cloud')).toBeTruthy();
    expect(mockFetchSchedules).not.toHaveBeenCalled();
  });

  it('filters the list to active or paused schedules', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const base = {
      prompt: 'Summarize inbox',
      model: 'test-model-fixture',
      recurrence: 'daily' as const,
      cronExpression: undefined,
      scheduledAt: null,
      timeOfDay: '09:00',
      timezone: 'UTC',
      lastRunAt: null,
      nextRunAt: null,
      lastRunStatus: null,
      createdAt: '2026-07-17T09:00:00.000Z',
      updatedAt: '2026-07-17T09:00:00.000Z',
    };
    useScheduleStore.setState({
      schedules: [
        { ...base, id: 'schedule-active', name: 'Morning briefing', isActive: true },
        { ...base, id: 'schedule-paused', name: 'Weekly rollup', isActive: false },
      ],
    });

    const { getByLabelText, getByText, queryByText } = render(<SchedulesScreen />);

    expect(getByText('Morning briefing')).toBeTruthy();
    expect(getByText('Weekly rollup')).toBeTruthy();

    fireEvent.press(getByLabelText('Filter schedules: Paused'));

    expect(queryByText('Morning briefing')).toBeNull();
    expect(getByText('Weekly rollup')).toBeTruthy();

    fireEvent.press(getByLabelText('Filter schedules: Active'));

    expect(getByText('Morning briefing')).toBeTruthy();
    expect(queryByText('Weekly rollup')).toBeNull();
  });

  it('keeps the filter chip row at its own height so the schedule list cannot squeeze or stretch it', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useScheduleStore.setState({
      schedules: [
        {
          id: 'schedule-active',
          name: 'Morning briefing',
          prompt: 'Summarize inbox',
          model: 'test-model-fixture',
          recurrence: 'daily' as const,
          cronExpression: undefined,
          scheduledAt: null,
          timeOfDay: '09:00',
          timezone: 'UTC',
          lastRunAt: null,
          nextRunAt: null,
          lastRunStatus: null,
          isActive: true,
          createdAt: '2026-07-17T09:00:00.000Z',
          updatedAt: '2026-07-17T09:00:00.000Z',
        },
      ],
    });

    const { UNSAFE_getAllByType } = render(<SchedulesScreen />);

    const row = UNSAFE_getAllByType(ScrollView).find((node) => node.props.horizontal);
    expect(row?.props.style).toMatchObject({ flexGrow: 0, flexShrink: 0 });
  });

  it('filters the list to completed schedules by their finished status', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const base = {
      prompt: 'Summarize inbox',
      model: 'test-model-fixture',
      recurrence: 'once' as const,
      cronExpression: undefined,
      scheduledAt: null,
      timeOfDay: '09:00',
      timezone: 'UTC',
      lastRunAt: null,
      nextRunAt: null,
      lastRunStatus: null,
      createdAt: '2026-07-17T09:00:00.000Z',
      updatedAt: '2026-07-17T09:00:00.000Z',
    };
    useScheduleStore.setState({
      schedules: [
        { ...base, id: 's-active', name: 'Morning briefing', isActive: true, status: 'active' },
        { ...base, id: 's-paused', name: 'Weekly rollup', isActive: false, status: 'paused' },
        { ...base, id: 's-done', name: 'One time reminder', isActive: false, status: 'completed' },
      ],
    });

    const { getByLabelText, getByText, queryByText } = render(<SchedulesScreen />);

    fireEvent.press(getByLabelText('Filter schedules: Completed'));
    expect(getByText('One time reminder')).toBeTruthy();
    expect(queryByText('Morning briefing')).toBeNull();
    expect(queryByText('Weekly rollup')).toBeNull();

    fireEvent.press(getByLabelText('Filter schedules: Paused'));
    expect(getByText('Weekly rollup')).toBeTruthy();
    expect(queryByText('One time reminder')).toBeNull();
  });

  it('asks before deleting from the More menu, naming the loss, and deletes only after the destructive button', () => {
    jest.useFakeTimers();
    jest.replaceProperty(Platform, 'OS', 'android');
    const deleteSchedule = jest.fn(async () => true);
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useScheduleStore.setState({
      schedules: [
        {
          id: 's-active',
          name: 'Morning briefing',
          prompt: 'Summarize inbox',
          model: 'test-model-fixture',
          recurrence: 'daily',
          scheduledAt: null,
          timeOfDay: '09:00',
          timezone: 'UTC',
          isActive: true,
          status: 'active',
          actionType: 'agent',
          lastRunAt: null,
          nextRunAt: null,
          lastRunStatus: null,
          createdAt: '2026-07-17T09:00:00.000Z',
          updatedAt: '2026-07-17T09:00:00.000Z',
        },
      ],
      deleteSchedule,
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByLabelText } = render(<SchedulesScreen />);
    fireEvent.press(getByLabelText('More actions for Morning briefing'));
    fireEvent.press(getByLabelText('Delete'));
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(alert).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alert.mock.calls[0];
    expect(title).toBe('Delete schedule?');
    expect(message).toBe(describeScheduleDeletion('Morning briefing'));
    expect(deleteSchedule).not.toHaveBeenCalled();

    const destructive = buttons?.find((button) => button.style === 'destructive');
    destructive?.onPress?.();
    expect(deleteSchedule).toHaveBeenCalledWith('s-active');
  });

  it('says so when no schedule has completed', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useScheduleStore.setState({
      schedules: [
        {
          id: 's-active',
          name: 'Morning briefing',
          prompt: 'Summarize inbox',
          model: 'test-model-fixture',
          recurrence: 'daily' as const,
          cronExpression: undefined,
          scheduledAt: null,
          timeOfDay: '09:00',
          timezone: 'UTC',
          lastRunAt: null,
          nextRunAt: null,
          lastRunStatus: null,
          createdAt: '2026-07-17T09:00:00.000Z',
          updatedAt: '2026-07-17T09:00:00.000Z',
          isActive: true,
          status: 'active',
        },
      ],
    });

    const { getByLabelText, getByText } = render(<SchedulesScreen />);
    fireEvent.press(getByLabelText('Filter schedules: Completed'));
    expect(getByText('No completed schedules.')).toBeTruthy();
  });

  it('sorts scheduled tasks by next run or recently created without losing the filter', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const base = {
      prompt: 'Summarize inbox',
      model: 'test-model-fixture',
      recurrence: 'daily' as const,
      cronExpression: undefined,
      scheduledAt: null,
      timeOfDay: '09:00',
      timezone: 'UTC',
      lastRunAt: null,
      lastRunStatus: null,
      updatedAt: '2026-07-17T09:00:00.000Z',
    };
    useScheduleStore.setState({
      schedules: [
        {
          ...base,
          id: 'recent-paused',
          name: 'Recent paused',
          isActive: false,
          nextRunAt: null,
          createdAt: '2026-07-19T09:00:00.000Z',
        },
        {
          ...base,
          id: 'later-active',
          name: 'Later active',
          isActive: true,
          nextRunAt: '2026-08-02T09:00:00.000Z',
          createdAt: '2026-07-18T09:00:00.000Z',
        },
        {
          ...base,
          id: 'sooner-active',
          name: 'Sooner active',
          isActive: true,
          nextRunAt: '2026-08-01T09:00:00.000Z',
          createdAt: '2026-07-17T09:00:00.000Z',
        },
      ],
    });

    const { getAllByLabelText, getByLabelText } = render(<SchedulesScreen />);
    const names = () =>
      getAllByLabelText(/^Schedule:/u).map((node) => node.props.accessibilityLabel);

    expect(names()).toEqual([
      expect.stringContaining('Sooner active'),
      expect.stringContaining('Later active'),
      expect.stringContaining('Recent paused'),
    ]);

    fireEvent.press(getByLabelText('Sort schedules'));
    expect(getByLabelText('Sort schedules by Next run').props.accessibilityState.selected).toBe(
      true,
    );
    fireEvent.press(getByLabelText('Sort schedules by Recently created'));
    expect(names()).toEqual([
      expect.stringContaining('Recent paused'),
      expect.stringContaining('Later active'),
      expect.stringContaining('Sooner active'),
    ]);

    fireEvent.press(getByLabelText('Filter schedules: Active'));
    expect(names()).toEqual([
      expect.stringContaining('Later active'),
      expect.stringContaining('Sooner active'),
    ]);
  });

  it('sends Free users to plan options instead of advertising an unavailable task', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useTierStore.setState({ tier: 'free' });

    const { getByLabelText, queryByLabelText } = render(<SchedulesScreen />);

    expect(queryByLabelText('Schedule a task')).toBeNull();
    expect(queryByLabelText('Use Daily briefing template')).toBeNull();
    fireEvent.press(getByLabelText('View plans for scheduled tasks'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/cloud-billing');
  });

  it('titles the header Scheduled and opens the cross-schedule runs screen', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { getByText, queryByText, getByLabelText } = render(<SchedulesScreen />);

    expect(getByText('Scheduled')).toBeTruthy();
    expect(queryByText('Schedules')).toBeNull();
    fireEvent.press(getByLabelText('Scheduled runs'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/schedules/runs');
  });

  it('keeps the header title in the row, capped and on one line, so it never runs under the buttons', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    const { getByTestId, getByRole } = render(<SchedulesScreen />);

    const header = getByTestId('schedules-header');
    expect(String(header.props.className)).toMatch(/\bmin-h-12\b/);
    const title = getByRole('header', { name: 'Scheduled' });
    expect(title.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
    expect(title.props.numberOfLines).toBe(1);
    expect(title.props.adjustsFontSizeToFit).toBe(true);
    let node = title.parent;
    while (node && node.props?.testID !== 'schedules-header') {
      expect(StyleSheet.flatten(node.props?.style)?.position).not.toBe('absolute');
      node = node.parent;
    }
    expect(node?.props?.testID).toBe('schedules-header');
  });

  describe('composer send', () => {
    const SENTENCE = 'Summarize my inbox every day at 8am';
    const typeIntoComposer = (utils: ReturnType<typeof render>, text: string) =>
      fireEvent.changeText(utils.getByLabelText('Schedule a task'), text);
    const pressCreateInSheet = (utils: ReturnType<typeof render>) =>
      fireEvent.press(utils.getAllByLabelText('Create schedule').at(-1)!);

    beforeEach(() => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
    });

    it('opens the review sheet prefilled with the parsed cadence and creates nothing yet', () => {
      const createSchedule = jest.fn(async () => true);
      useScheduleStore.setState({ createSchedule });
      const utils = render(<SchedulesScreen />);

      typeIntoComposer(utils, SENTENCE);
      fireEvent.press(utils.getByLabelText('Continue scheduling task'));

      expect(utils.getByText('Quick Schedule')).toBeTruthy();
      expect(utils.getByText('Daily at 08:00')).toBeTruthy();
      expect(utils.getAllByDisplayValue(SENTENCE).length).toBe(3);
      expect(createSchedule).not.toHaveBeenCalled();
    });

    it('creates the task with the parsed cadence on the confirm tap and clears the composer', async () => {
      const createSchedule = jest.fn(async () => true);
      useScheduleStore.setState({ createSchedule });
      const utils = render(<SchedulesScreen />);

      typeIntoComposer(utils, SENTENCE);
      fireEvent.press(utils.getByLabelText('Continue scheduling task'));
      pressCreateInSheet(utils);

      await waitFor(() =>
        expect(createSchedule).toHaveBeenCalledWith(
          expect.objectContaining({
            prompt: SENTENCE,
            recurrence: 'daily',
            timeOfDay: '08:00',
            isActive: true,
          }),
        ),
      );
      await waitFor(() => expect(utils.queryByDisplayValue(SENTENCE)).toBeNull());
      expect(utils.queryByText('Quick Schedule')).toBeNull();
    });

    it('opens the sheet with an empty cadence when none can be read', () => {
      const createSchedule = jest.fn(async () => true);
      useScheduleStore.setState({ createSchedule });
      const utils = render(<SchedulesScreen />);

      typeIntoComposer(utils, 'Summarize my inbox');
      fireEvent.press(utils.getByLabelText('Continue scheduling task'));

      expect(utils.getByText('Quick Schedule')).toBeTruthy();
      expect(utils.getAllByDisplayValue('Summarize my inbox').length).toBe(2);
      expect(createSchedule).not.toHaveBeenCalled();
    });

    it('keeps the unsent task text in the composer when the sheet is closed without creating', () => {
      const createSchedule = jest.fn(async () => true);
      useScheduleStore.setState({ createSchedule });
      const utils = render(<SchedulesScreen />);

      typeIntoComposer(utils, SENTENCE);
      fireEvent.press(utils.getByLabelText('Continue scheduling task'));
      fireEvent.press(utils.getByLabelText('Close quick schedule'));

      expect(utils.queryByText('Quick Schedule')).toBeNull();
      expect(utils.getByLabelText('Schedule a task').props.value).toBe(SENTENCE);
      expect(createSchedule).not.toHaveBeenCalled();
    });

    it('does not read a time out of an unrelated "at" in the text', () => {
      const utils = render(<SchedulesScreen />);

      typeIntoComposer(utils, 'Look at my inbox');
      fireEvent.press(utils.getByLabelText('Continue scheduling task'));

      expect(utils.queryByText('Daily at 09:00')).toBeNull();
      expect(utils.getAllByDisplayValue('Look at my inbox').length).toBe(2);
    });

    it('creates a one-time task for a calendar date instead of a daily one', async () => {
      const createSchedule = jest.fn(async () => true);
      useScheduleStore.setState({ createSchedule });
      const utils = render(<SchedulesScreen />);

      typeIntoComposer(utils, 'Pay rent on January 5 2031 at 9am');
      fireEvent.press(utils.getByLabelText('Continue scheduling task'));

      expect(utils.getByText('Once on Jan 5, 2031 at 09:00')).toBeTruthy();
      expect(utils.queryByText('Daily at 09:00')).toBeNull();
      pressCreateInSheet(utils);

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await waitFor(() =>
        expect(createSchedule).toHaveBeenCalledWith(
          expect.objectContaining({
            recurrence: 'once',
            timeOfDay: '09:00',
            scheduledAt: zonedDateAndTimeToIso('2031-01-05', '09:00', timezone),
            timezone,
          }),
        ),
      );
    });

    it('says when the time it was given cannot be read', () => {
      const utils = render(<SchedulesScreen />);

      typeIntoComposer(utils, 'Summarize my inbox');
      fireEvent.press(utils.getByLabelText('Continue scheduling task'));
      fireEvent.changeText(
        utils.getByPlaceholderText('e.g. "Every day at 9am"'),
        'next Friday at 9am',
      );

      expect(
        utils.getByText(
          'Could not understand the schedule. Try "Every day at 9am" or "January 5 at 9am".',
        ),
      ).toBeTruthy();
    });

    it('keeps the text and shows the failure when the confirmed creation fails', async () => {
      const createSchedule = jest.fn(async () => {
        throw new Error('network');
      });
      useScheduleStore.setState({ createSchedule });
      const utils = render(<SchedulesScreen />);

      typeIntoComposer(utils, SENTENCE);
      fireEvent.press(utils.getByLabelText('Continue scheduling task'));
      pressCreateInSheet(utils);

      await waitFor(() =>
        expect(utils.getByText('Failed to create schedule. Please try again.')).toBeTruthy(),
      );
      expect(utils.getAllByDisplayValue(SENTENCE).length).toBeGreaterThan(0);
    });
  });
});
