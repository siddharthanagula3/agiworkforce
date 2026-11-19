import React from 'react';
import { Modal, Platform } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  type ReactTestInstance,
} from '@testing-library/react-native';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : icon) });
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { hapticsEnabled: boolean }) => unknown) =>
    selector({ hapticsEnabled: false }),
}));

jest.mock('../src/features/schedules/components/ScheduleRunHistory', () => {
  const { Text } = jest.requireActual('react-native');
  return { ScheduleRunHistory: () => <Text>Run on Nov 14</Text> };
});

import * as service from '../src/features/schedules/service';
import { ScheduleCard } from '../src/features/schedules/components/ScheduleCard';
import type { Schedule } from '../src/features/schedules/store';
import { DEFAULT_AUTO_MODE_ID } from '../lib/models';
import { getManagedDisplayName } from '../src/features/model-picker/service';

const PAUSED: Schedule = {
  id: 'schedule-1',
  name: 'Weekly rollup',
  prompt: 'Summarize the week',
  model: DEFAULT_AUTO_MODE_ID,
  recurrence: 'weekly',
  daysOfWeek: [0],
  scheduledAt: null,
  timeOfDay: '18:00',
  timezone: 'UTC',
  isActive: false,
  status: 'paused',
  actionType: 'agent',
  lastRunAt: null,
  nextRunAt: null,
  lastRunStatus: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

function firstAncestorClaimingTouch(element: ReactTestInstance): ReactTestInstance | null {
  let current: ReactTestInstance | null = element;
  while (current) {
    const claims = current.props.onStartShouldSetResponder as (() => boolean) | undefined;
    if (typeof current.type === 'string' && claims?.() === true) return current;
    current = current.parent;
  }
  return null;
}

function renderCard(schedule: Schedule = PAUSED) {
  const onPress = jest.fn();
  const onToggle = jest.fn();
  const onDelete = jest.fn();
  render(
    <ScheduleCard
      schedule={schedule}
      index={0}
      onPress={onPress}
      onToggle={onToggle}
      onDelete={onDelete}
    />,
  );
  return { onPress, onToggle, onDelete, card: screen.getByLabelText(/^Schedule: Weekly rollup/) };
}

const ACTIVE: Schedule = { ...PAUSED, isActive: true, status: 'active' };
const COMPLETED: Schedule = { ...PAUSED, isActive: false, status: 'completed' };

function flushTimers() {
  act(() => {
    jest.runOnlyPendingTimers();
  });
}

function openMenu() {
  fireEvent.press(screen.getByLabelText('More actions for Weekly rollup'));
}

function menuKeys(): string[] {
  return screen
    .queryAllByTestId(/^conversation-action-/)
    .map((node) => String(node.props.testID).replace('conversation-action-', ''))
    .filter((key) => key !== 'cancel');
}

describe('Schedule card controls', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.replaceProperty(Platform, 'OS', 'android');
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('keeps a tap on More actions from opening the editor', () => {
    const { card } = renderCard();
    const more = screen.getByLabelText('More actions for Weekly rollup');

    const claimant = firstAncestorClaimingTouch(more);
    expect(claimant).not.toBeNull();
    expect(claimant).not.toBe(card);
  });

  it('keeps a tap inside the expanded run history from opening the editor', () => {
    const { card } = renderCard();
    fireEvent.press(screen.getByLabelText('Show run history'), { stopPropagation: jest.fn() });

    const claimant = firstAncestorClaimingTouch(screen.getByText('Run on Nov 14'));
    expect(claimant).not.toBeNull();
    expect(claimant).not.toBe(card);
  });

  it('still opens the editor from the card body', () => {
    const { onPress } = renderCard();

    fireEvent.press(screen.getByText('Summarize the week'));

    expect(onPress).toHaveBeenCalledWith('schedule-1');
  });

  it('says in words that the schedule has not run instead of model and status chips', () => {
    renderCard();

    expect(screen.getByText('Not run yet')).toBeTruthy();
    expect(screen.queryByText('Never')).toBeNull();
    expect(screen.queryByText(getManagedDisplayName(DEFAULT_AUTO_MODE_ID))).toBeNull();
  });

  it('names a failed last run', () => {
    renderCard({
      ...PAUSED,
      lastRunAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      lastRunStatus: 'failed',
    });

    expect(screen.getByText('Last run failed 5m ago')).toBeTruthy();
    expect(screen.queryByText('Failed')).toBeNull();
  });

  it('keeps Delete and Run now off the card face', () => {
    renderCard(ACTIVE);

    expect(screen.queryByLabelText('Delete schedule')).toBeNull();
    expect(screen.queryByLabelText('Run now')).toBeNull();
    expect(screen.getByLabelText('Show run history')).toBeTruthy();
  });

  it('lists every action for an active schedule, with Delete last', () => {
    renderCard(ACTIVE);
    openMenu();

    expect(menuKeys()).toEqual(['run-now', 'toggle-active', 'toggle-history', 'edit', 'delete']);
    expect(screen.getByLabelText('Pause')).toBeTruthy();
  });

  it('offers Resume and says why Run now is missing for a paused schedule', () => {
    renderCard();
    openMenu();

    expect(menuKeys()).toEqual(['toggle-active', 'toggle-history', 'edit', 'delete']);
    expect(screen.getByLabelText('Resume')).toBeTruthy();
    expect(screen.getByText('Resume this schedule to run it now.')).toBeTruthy();
  });

  it('does not tell a schedule paused for approval to resume', () => {
    renderCard({ ...PAUSED, pausedReason: 'approval_required' });
    openMenu();

    expect(menuKeys()).toEqual(['toggle-active', 'toggle-history', 'edit', 'delete']);
    expect(screen.queryByText('Resume this schedule to run it now.')).toBeNull();
  });

  it('reaches the menu through a VoiceOver action on the card, leaving a double tap to open the editor', () => {
    const { card, onPress } = renderCard(ACTIVE);

    expect(card.props.accessibilityActions).toEqual([
      { name: 'more-actions', label: 'More actions' },
    ]);
    fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(menuKeys()).toEqual([]);

    fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'more-actions' } });
    expect(menuKeys()).toEqual(['run-now', 'toggle-active', 'toggle-history', 'edit', 'delete']);

    fireEvent.press(card);
    expect(onPress).toHaveBeenCalledWith('schedule-1');
  });

  it('runs menu items chosen from the VoiceOver action once the iOS sheet has dismissed', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const { card, onDelete } = renderCard(ACTIVE);
    fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'more-actions' } });
    fireEvent.press(screen.getByLabelText('Delete'));
    expect(onDelete).not.toHaveBeenCalled();
    act(() => {
      screen.UNSAFE_getByType(Modal).props.onDismiss();
    });

    expect(onDelete).toHaveBeenCalledWith('schedule-1');
  });

  it('shows only History and Delete for a completed schedule', () => {
    renderCard(COMPLETED);
    openMenu();

    expect(menuKeys()).toEqual(['toggle-history', 'delete']);
    expect(screen.queryByText('Resume this schedule to run it now.')).toBeNull();
  });

  it('toggles the pause state and the history from the menu', () => {
    const { onToggle } = renderCard(ACTIVE);
    openMenu();
    fireEvent.press(screen.getByLabelText('Pause'));
    flushTimers();
    expect(onToggle).toHaveBeenCalledWith('schedule-1');

    openMenu();
    fireEvent.press(screen.getByLabelText('Show history'));
    flushTimers();
    expect(screen.getByText('Run on Nov 14')).toBeTruthy();
    openMenu();
    expect(screen.getByLabelText('Hide history')).toBeTruthy();
  });

  it('opens the editor from Edit in the menu', () => {
    const { onPress } = renderCard(ACTIVE);
    openMenu();
    fireEvent.press(screen.getByLabelText('Edit'));
    flushTimers();

    expect(onPress).toHaveBeenCalledWith('schedule-1');
  });

  it('hands Delete to the parent so its confirmation names what is lost', () => {
    const { onDelete } = renderCard(ACTIVE);
    openMenu();
    fireEvent.press(screen.getByLabelText('Delete'));
    flushTimers();

    expect(onDelete).toHaveBeenCalledWith('schedule-1');
  });

  it('starts a run from Run now in the menu and shows the failure under the card', async () => {
    const start = jest.spyOn(service, 'triggerScheduleNow').mockRejectedValue(new Error('down'));
    renderCard(ACTIVE);
    openMenu();
    fireEvent.press(screen.getByLabelText('Run now'));
    flushTimers();

    expect(start).toHaveBeenCalledWith('schedule-1');
    expect(await screen.findByText(/could not start|down/i)).toBeTruthy();
  });
});
