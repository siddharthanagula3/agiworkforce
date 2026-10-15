import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  inDesktop: true,
  stop: vi.fn(),
}));

vi.mock('@/lib/tauri-mock', () => ({
  invoke: (...args: unknown[]) => mocks.invoke(...args),
  listen: (...args: unknown[]) => mocks.listen(...args),
  isTauriContext: () => mocks.inDesktop,
}));

import { KeptSettingsFileNotice } from './KeptSettingsFileNotice';

const KEPT = '/data/com.agiworkforce.desktop/settings.json.unreadable-20261011T093000Z';

describe('KeptSettingsFileNotice', () => {
  beforeEach(() => {
    mocks.inDesktop = true;
    mocks.invoke.mockReset();
    mocks.listen.mockReset();
    mocks.stop.mockReset();
    mocks.invoke.mockResolvedValue(null);
    mocks.listen.mockResolvedValue(mocks.stop);
  });

  afterEach(() => cleanup());

  it('shows nothing when no settings file was kept', async () => {
    render(<KeptSettingsFileNotice />);
    await act(async () => undefined);

    expect(mocks.invoke).toHaveBeenCalledWith('settings_kept_unreadable_file');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('names the file kept earlier in this session', async () => {
    mocks.invoke.mockResolvedValue(KEPT);
    render(<KeptSettingsFileNotice />);

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain('could not be read');
    expect(notice.textContent).toContain(KEPT);
  });

  it('names the file the moment a save keeps one, and stops listening on unmount', async () => {
    const { unmount } = render(<KeptSettingsFileNotice />);
    await act(async () => undefined);
    expect(mocks.listen).toHaveBeenCalledWith(
      'settings:unreadable-file-kept',
      expect.any(Function),
    );

    const onKept = mocks.listen.mock.calls[0]![1] as (event: { payload: string }) => void;
    act(() => onKept({ payload: KEPT }));
    expect(screen.getByRole('status').textContent).toContain(KEPT);

    unmount();
    expect(mocks.stop).toHaveBeenCalledTimes(1);
  });

  it('asks nothing outside the desktop app', () => {
    mocks.inDesktop = false;
    render(<KeptSettingsFileNotice />);

    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.listen).not.toHaveBeenCalled();
  });
});
