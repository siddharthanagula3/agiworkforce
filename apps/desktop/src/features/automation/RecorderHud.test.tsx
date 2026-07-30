import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  automationRecordGetStatus: vi.fn(),
  automationRecordStop: vi.fn(),
  automationRecordDiscard: vi.fn(),
  closeCurrentRecorderHud: vi.fn(),
  startNarration: vi.fn(),
  stopNarration: vi.fn(),
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
}));

vi.mock('@agiworkforce/desktop-command-client', () => ({
  automation: {
    automationRecordGetStatus: mocks.automationRecordGetStatus,
    automationRecordStop: mocks.automationRecordStop,
    automationRecordDiscard: mocks.automationRecordDiscard,
  },
}));

vi.mock('@/lib/tauri-mock', () => ({
  listen: vi.fn(async (event: string, callback: (value: { payload: unknown }) => void) => {
    mocks.listeners.set(event, callback);
    return () => mocks.listeners.delete(event);
  }),
}));

vi.mock('@/services/recorderHudWindow', () => ({
  RECORDER_STOP_SHORTCUT_ACTION: 'stop_recorder',
  closeCurrentRecorderHud: mocks.closeCurrentRecorderHud,
}));

vi.mock('./useRecorderNarration', () => ({
  useRecorderNarration: () => ({
    error: null,
    isAvailable: true,
    level: 0.4,
    phase: 'off',
    startNarration: mocks.startNarration,
    stopNarration: mocks.stopNarration,
  }),
}));

import { RecorderHud } from './RecorderHud';

describe('RecorderHud', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listeners.clear();
    mocks.automationRecordGetStatus.mockResolvedValue({
      sessionId: 'session-1',
      startTime: Date.now() - 2_000,
      isRecording: true,
      actionCount: 2,
      durationMs: 2_000,
    });
    mocks.automationRecordStop.mockResolvedValue({
      id: 'recording-1',
      name: 'Recording',
      actions: [{ id: 'step-1' }, { id: 'step-2' }],
      durationMs: 2_500,
      createdAt: Date.now() - 2_500,
    });
    mocks.automationRecordDiscard.mockResolvedValue({
      sessionId: 'session-1',
      actionCount: 2,
      durationMs: 2_500,
    });
    mocks.closeCurrentRecorderHud.mockResolvedValue(undefined);
    mocks.startNarration.mockResolvedValue(undefined);
    mocks.stopNarration.mockResolvedValue(undefined);
  });

  it('shows native live status and increments from the shared action stream', async () => {
    render(<RecorderHud />);

    expect(await screen.findByText('Capturing · 2 steps')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start narration' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Narration off, input level 40 percent/)).toBeInTheDocument();

    act(() => {
      mocks.listeners.get('automation:action_recorded')?.({ payload: {} });
    });
    expect(screen.getByText('Capturing · 3 steps')).toBeInTheDocument();
  });

  it('finishes from the HUD and closes the detached window', async () => {
    const user = userEvent.setup();
    render(<RecorderHud />);

    await user.click(await screen.findByRole('button', { name: 'Done' }));

    await waitFor(() => expect(mocks.automationRecordStop).toHaveBeenCalledOnce());
    expect(mocks.closeCurrentRecorderHud).toHaveBeenCalled();
  });

  it('discards without producing a reviewable recording', async () => {
    const user = userEvent.setup();
    render(<RecorderHud />);

    await user.click(await screen.findByRole('button', { name: 'Discard' }));

    await waitFor(() => expect(mocks.automationRecordDiscard).toHaveBeenCalledOnce());
    expect(mocks.stopNarration).toHaveBeenCalledWith({ discard: true });
    expect(mocks.automationRecordStop).not.toHaveBeenCalled();
  });

  it('honors the global stop shortcut without focusing the main app', async () => {
    render(<RecorderHud />);
    await screen.findByText('Capturing · 2 steps');
    await waitFor(() => expect(mocks.listeners.has('shortcut_action')).toBe(true));

    act(() => {
      mocks.listeners.get('shortcut_action')?.({ payload: 'stop_recorder' });
    });

    await waitFor(() => expect(mocks.automationRecordStop).toHaveBeenCalledOnce());
  });
});
