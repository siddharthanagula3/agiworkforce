import React from 'react';
import { Alert } from 'react-native';
import { render } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockScheduleForm = jest.fn(() => null);
let mockSearchParams: { id?: string; template?: string } = {};

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
    canGoBack: jest.fn(() => true),
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('lucide-react-native', () => ({
  ArrowLeft: jest.fn().mockReturnValue(null),
}));

jest.mock('../src/features/schedules/components/ScheduleForm', () => ({
  ScheduleForm: (props: unknown) => mockScheduleForm(props),
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import CreateScheduleScreen from '../app/(app)/schedules/create';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useScheduleStore, type Schedule } from '../src/features/schedules/store';
import { useTierStore } from '../src/features/billing/store';
import { DEFAULT_AUTO_MODE_ID } from '../lib/models';

describe('Create schedule template handoff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useTierStore.setState({ tier: 'basic' });
    useScheduleStore.setState({
      schedules: [],
      loading: false,
      error: null,
    });
  });

  it('prefills the form by resolving the allowlisted template ID', () => {
    mockSearchParams = { template: 'monday-kickoff' };

    render(<CreateScheduleScreen />);

    expect(mockScheduleForm).toHaveBeenCalledWith(
      expect.objectContaining({
        initialData: expect.objectContaining({
          name: 'Monday kickoff',
          recurrence: 'weekly',
          daysOfWeek: [1],
        }),
      }),
    );
  });

  it('ignores unknown template IDs', () => {
    mockSearchParams = { template: 'unknown-template' };

    render(<CreateScheduleScreen />);

    expect(mockScheduleForm).toHaveBeenCalledWith(
      expect.objectContaining({
        initialData: undefined,
      }),
    );
  });

  it('prefers an existing schedule over a template when editing', () => {
    const existingSchedule: Schedule = {
      id: 'schedule-1',
      name: 'Existing schedule',
      prompt: 'Keep the saved prompt.',
      model: DEFAULT_AUTO_MODE_ID,
      recurrence: 'daily',
      scheduledAt: null,
      timeOfDay: '10:00',
      timezone: 'America/Chicago',
      isActive: true,
      lastRunAt: null,
      nextRunAt: null,
      lastRunStatus: null,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    };
    mockSearchParams = { id: existingSchedule.id, template: 'daily-focus' };
    useScheduleStore.setState({ schedules: [existingSchedule] });

    render(<CreateScheduleScreen />);

    expect(mockScheduleForm).toHaveBeenCalledWith(
      expect.objectContaining({
        initialData: existingSchedule,
      }),
    );
  });

  it('keeps the edit screen open when deletion fails', async () => {
    mockSearchParams = { id: 'schedule-1' };
    useScheduleStore.setState({
      schedules: [{ id: 'schedule-1', name: 'Existing schedule' }] as never,
      deleteSchedule: jest.fn().mockResolvedValue(false),
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    render(<CreateScheduleScreen />);
    const formProps = mockScheduleForm.mock.lastCall?.[0] as { onDelete: () => void };
    formProps.onDelete();
    const buttons = alert.mock.lastCall?.[2];
    await buttons?.find((button) => button.text === 'Delete')?.onPress?.();

    expect(mockBack).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});
