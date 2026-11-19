jest.mock('@/src/features/billing/nativePurchaseAvailability', () => ({
  NATIVE_PURCHASES_AVAILABLE: false,
}));
import React from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';
import { ScrollView, StyleSheet } from 'react-native';
import { READING_COLUMN_MAX_WIDTH } from '@/src/shared/layout/contentColumn';
import type { ReactTestInstance } from 'react-test-renderer';

const mockPush = jest.fn();
const mockFetchSchedules = jest.fn(async () => undefined);

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  }),
}));

const mockOpenWebContentPage = jest.fn(async () => true);
jest.mock('../src/platform/webContentPage', () => ({
  openWebContentPage: (path: string) => mockOpenWebContentPage(path),
  webContentPageUrl: (path: string) => `https://example.test${path}`,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../src/features/voice/components/VoiceInputButton', () => ({
  VoiceInputButton: () => null,
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

function scrollAncestor(node: ReactTestInstance): ReactTestInstance | null {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === ScrollView) return current;
  }
  return null;
}

describe('Schedules empty state at large text sizes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useChatAppModeStore.setState({ appMode: 'cloud' });
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

  it('keeps Create outside the scrolling text, so a long title and description cannot push it under the composer', () => {
    const { getByLabelText, getByText, getByTestId } = render(<SchedulesScreen />);

    const create = getByLabelText('Create Schedule');
    expect(scrollAncestor(create)).toBeNull();

    const scroll = getByTestId('schedules-empty-scroll');
    expect(scroll.props.horizontal).toBeFalsy();
    expect(scrollAncestor(getByText('No Schedules'))).not.toBeNull();
    expect(scrollAncestor(getByText('Try a template'))).not.toBeNull();
    expect(scrollAncestor(getByLabelText('Schedule a task'))).toBeNull();

    fireEvent.press(create);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(app)/schedules/create' });
  });

  it('holds the empty page to the reading column on a wide pane', () => {
    const { getByTestId } = render(<SchedulesScreen />);

    expect(
      StyleSheet.flatten(getByTestId('schedules-empty-scroll').props.contentContainerStyle),
    ).toMatchObject({
      width: '100%',
      maxWidth: READING_COLUMN_MAX_WIDTH,
      alignSelf: 'center',
      paddingHorizontal: 24,
    });
  });

  it('shows no action and no purchase wording when the plan has no scheduled tasks', () => {
    useTierStore.setState({ tier: 'free' });
    const { getAllByText, getByText, queryByLabelText, queryByText, queryByTestId } = render(
      <SchedulesScreen />,
    );

    expect(getAllByText("Scheduled tasks aren't included in your plan").length).toBeGreaterThan(0);
    expect(getByText('Free Cloud chat remains available.')).toBeTruthy();
    expect(queryByLabelText('Create Schedule')).toBeNull();
    expect(queryByLabelText('View Plans')).toBeNull();
    expect(queryByTestId('schedules-empty-action')).toBeNull();
    expect(queryByText(/upgrade/i)).toBeNull();
  });

  it('puts the help link under the description and above Create, and opens the article', () => {
    const { getByLabelText, getByTestId } = render(<SchedulesScreen />);

    const link = getByLabelText('How schedules work');
    expect(link.props.accessibilityRole).toBe('link');
    expect(scrollAncestor(link)).not.toBeNull();
    expect(scrollAncestor(getByLabelText('Create Schedule'))).toBeNull();

    const scroll = getByTestId('schedules-empty-scroll');
    const texts = within(scroll)
      .getAllByText(/.+/)
      .map((node) => [node.props.children].flat().join(''));
    const order = (label: string) => texts.findIndex((text) => text.startsWith(label));
    expect(order('Recurring tasks that run')).toBeGreaterThanOrEqual(0);
    expect(order('How schedules work')).toBeGreaterThan(order('Recurring tasks that run'));
    expect(order('Try a template')).toBeGreaterThan(order('How schedules work'));

    fireEvent.press(link);
    expect(mockOpenWebContentPage).toHaveBeenCalledWith('/help/schedules-and-triggers');
  });

  it('keeps the help link when the plan has no scheduled tasks, and keeps upgrade wording out', () => {
    useTierStore.setState({ tier: 'free' });
    const { getByLabelText, queryByText } = render(<SchedulesScreen />);

    expect(getByLabelText('How schedules work')).toBeTruthy();
    expect(queryByText(/upgrade|view plans/i)).toBeNull();
  });

  it('shows no upgrade wording for a plan that can create schedules while purchases are unavailable', () => {
    const { queryByText, queryByLabelText } = render(<SchedulesScreen />);

    expect(queryByText(/upgrade/i)).toBeNull();
    expect(queryByLabelText('View Plans')).toBeNull();
  });
});
