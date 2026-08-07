import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('ActionRecorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listen.mockResolvedValue(() => {});
    mocks.automationRecordGetStatus.mockResolvedValue(null);
    mocks.automationRecordGetLast.mockResolvedValue(null);
    mocks.automationRecordDiscard.mockResolvedValue({
      sessionId: 'session-1',
      actionCount: 0,
      durationMs: 0,
    });
    mocks.automationRecordClearLast.mockResolvedValue(undefined);
    mocks.openRecorderHudWindow.mockResolvedValue(undefined);
    mocks.closeRecorderHudWindow.mockResolvedValue(undefined);
    mocks.automationRecordStart.mockResolvedValue({
      sessionId: 'session-1',
      startTime: 1,
      isRecording: true,
    });
  });

  it('explains local capture and blocks recording when permissions are missing', async () => {
    const user = userEvent.setup();
    mocks.checkAutomationPermissions.mockResolvedValue({
      accessibility: false,
      inputMonitoring: false,
      screenRecording: false,
    });

    render(<ActionRecorder />);

    expect(screen.getByText('Your recording stays local')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'I understand, continue' }));
    await user.click(screen.getByRole('button', { name: 'Start recording' }));

    expect(
      await screen.findByText('Allow Desktop control to record and replay'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Allow Accessibility' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Allow Input Monitoring' })).toBeInTheDocument();
    expect(mocks.automationRecordStart).not.toHaveBeenCalled();
  });

  it('refuses to create a successful zero-step recording', async () => {
    const user = userEvent.setup();
    mocks.checkAutomationPermissions.mockResolvedValue({
      accessibility: true,
      inputMonitoring: true,
      screenRecording: false,
    });
    mocks.automationRecordStop.mockResolvedValue({
      id: 'recording-1',
      name: 'Empty recording',
      actions: [],
      durationMs: 1000,
      createdAt: 1,
    });

    render(<ActionRecorder />);

    await user.click(screen.getByRole('button', { name: 'I understand, continue' }));
    await user.click(screen.getByRole('button', { name: 'Start recording' }));
    expect(mocks.openRecorderHudWindow).toHaveBeenCalledOnce();
    await user.click(await screen.findByRole('button', { name: 'Done' }));

    expect(await screen.findByText('That recording has nothing to learn from')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Describe it instead' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create skill' })).not.toBeInTheDocument();
  });

  it('aborts native capture if the detached controls cannot open', async () => {
    const user = userEvent.setup();
    mocks.checkAutomationPermissions.mockResolvedValue({
      accessibility: true,
      inputMonitoring: true,
      screenRecording: false,
    });
    mocks.openRecorderHudWindow.mockRejectedValue(new Error('HUD unavailable'));

    render(<ActionRecorder />);

    await user.click(screen.getByRole('button', { name: 'I understand, continue' }));
    await user.click(screen.getByRole('button', { name: 'Start recording' }));

    expect(await screen.findByText('HUD unavailable')).toBeInTheDocument();
    expect(mocks.automationRecordDiscard).toHaveBeenCalledOnce();
    expect(screen.queryByText('Capturing your workflow')).not.toBeInTheDocument();
  });

  it('creates a reusable managed skill from a reviewed recording', async () => {
    const user = userEvent.setup();
    const action = {
      id: 'action-1',
      actionType: 'click' as const,
      timestampMs: 200,
      target: { x: 30, y: 40 },
    };
    const recording = {
      id: 'recording-1',
      name: 'Recorded workflow',
      actions: [action],
      durationMs: 800,
      createdAt: 1,
    };
    mocks.checkAutomationPermissions.mockResolvedValue({
      accessibility: true,
      inputMonitoring: true,
      screenRecording: false,
    });
    mocks.automationRecordStop.mockResolvedValue(recording);
    mocks.skillCreateFromRecording.mockResolvedValue({
      skill: { name: 'Investor demo' },
      actionCount: 1,
      path: '/tmp/investor-demo',
    });

    render(<ActionRecorder />);

    await user.click(screen.getByRole('button', { name: 'I understand, continue' }));
    await user.click(screen.getByRole('button', { name: 'Start recording' }));
    await user.click(await screen.findByRole('button', { name: 'Done' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Investor demo' },
    });
    fireEvent.change(screen.getByLabelText('When should AGI use it?'), {
      target: { value: 'Use this for the investor walkthrough.' },
    });
    await user.click(screen.getByRole('button', { name: 'Create skill' }));

    await waitFor(() => {
      expect(mocks.skillCreateFromRecording).toHaveBeenCalledWith(
        recording,
        'Investor demo',
        'Use this for the investor walkthrough.',
      );
    });
  });
});
