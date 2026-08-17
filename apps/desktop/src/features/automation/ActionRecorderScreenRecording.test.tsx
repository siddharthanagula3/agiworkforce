import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkAutomationPermissions: vi.fn(),
  requestAutomationPermission: vi.fn(),
  automationRecordStart: vi.fn(),
  automationRecordStop: vi.fn(),
  automationRecordDiscard: vi.fn(),
  automationRecordGetStatus: vi.fn(),
  automationRecordGetLast: vi.fn(),
  automationRecordClearLast: vi.fn(),
  skillCreateFromRecording: vi.fn(),
  openRecorderHudWindow: vi.fn(),
  closeRecorderHudWindow: vi.fn(),
  listen: vi.fn(),
}));

vi.mock('@agiworkforce/desktop-command-client', () => ({
  automation: {
    checkAutomationPermissions: mocks.checkAutomationPermissions,
    requestAutomationPermission: mocks.requestAutomationPermission,
    automationRecordStart: mocks.automationRecordStart,
    automationRecordStop: mocks.automationRecordStop,
    automationRecordDiscard: mocks.automationRecordDiscard,
    automationRecordGetStatus: mocks.automationRecordGetStatus,
    automationRecordGetLast: mocks.automationRecordGetLast,
    automationRecordClearLast: mocks.automationRecordClearLast,
  },
  skills: {
    skillCreateFromRecording: mocks.skillCreateFromRecording,
  },
}));

vi.mock('../../lib/tauri-mock', () => ({
  listen: mocks.listen,
}));

vi.mock('@/services/recorderHudWindow', () => ({
  openRecorderHudWindow: mocks.openRecorderHudWindow,
  closeRecorderHudWindow: mocks.closeRecorderHudWindow,
}));

import { ActionRecorder } from './ActionRecorder';

async function recordAnEmptyCapture(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'I understand, continue' }));
  await user.click(screen.getByRole('button', { name: 'Start recording' }));
  await user.click(await screen.findByRole('button', { name: 'Done' }));
}

describe('ActionRecorder screen recording preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listen.mockResolvedValue(() => {});
    mocks.automationRecordGetStatus.mockResolvedValue(null);
    mocks.automationRecordGetLast.mockResolvedValue(null);
    mocks.automationRecordClearLast.mockResolvedValue(undefined);
    mocks.openRecorderHudWindow.mockResolvedValue(undefined);
    mocks.closeRecorderHudWindow.mockResolvedValue(undefined);
    mocks.requestAutomationPermission.mockResolvedValue(undefined);
    mocks.automationRecordStart.mockResolvedValue({
      sessionId: 'session-1',
      startTime: 1,
      isRecording: true,
    });
    mocks.automationRecordStop.mockResolvedValue({
      id: 'recording-1',
      name: 'Empty recording',
      actions: [],
      durationMs: 1000,
      createdAt: 1,
    });
  });

  it('records without Screen Recording but offers the grant replay depends on', async () => {
    const user = userEvent.setup();
    mocks.checkAutomationPermissions.mockResolvedValue({
      accessibility: true,
      inputMonitoring: true,
      screenRecording: false,
    });

    render(<ActionRecorder />);
    await recordAnEmptyCapture(user);

    expect(mocks.automationRecordStart).toHaveBeenCalledOnce();
    expect(
      await screen.findByText('Replaying this skill needs Screen Recording'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Allow Screen Recording' }));

    expect(mocks.requestAutomationPermission).toHaveBeenCalledWith('screen_recording');
    expect(mocks.checkAutomationPermissions).toHaveBeenCalledTimes(2);
  });

  it('stays quiet once macOS has granted Screen Recording', async () => {
    const user = userEvent.setup();
    mocks.checkAutomationPermissions.mockResolvedValue({
      accessibility: true,
      inputMonitoring: true,
      screenRecording: true,
    });

    render(<ActionRecorder />);
    await recordAnEmptyCapture(user);

    expect(await screen.findByText('That recording has nothing to learn from')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Allow Screen Recording' }),
    ).not.toBeInTheDocument();
  });
});
