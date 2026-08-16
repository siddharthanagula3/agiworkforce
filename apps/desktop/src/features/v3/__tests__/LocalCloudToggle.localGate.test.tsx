import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setMode: vi.fn(),
  mode: 'cloud' as 'cloud' | 'local',
  supportsLocalAppMode: false,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      const labels: Record<string, string> = {
        'sidebar.mode.local': 'Local',
        'sidebar.mode.cloud': 'Cloud',
        'sidebar.mode.aria': 'Switch between Local and Cloud',
        'sidebar.mode.localUnavailable': 'Local mode runs in the AGI Workforce desktop app.',
      };
      if (key === 'sidebar.mode.switchTo') return `Switch to ${vars?.['mode'] ?? ''}`;
      return labels[key] ?? key;
    },
  }),
}));

vi.mock('../../../stores/appModeStore', () => ({
  selectMode: (state: { mode: string }) => state.mode,
  useAppModeStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ mode: mocks.mode, setMode: mocks.setMode }),
}));

vi.mock('../../../lib/runtimeEnvironment', () => ({
  get supportsLocalAppMode() {
    return mocks.supportsLocalAppMode;
  },
}));

async function renderToggle(collapsed = false) {
  const { LocalCloudToggle } = await import('../LocalCloudToggle');
  return render(<LocalCloudToggle collapsed={collapsed} />);
}

afterEach(() => {
  cleanup();
  mocks.setMode.mockClear();
  mocks.mode = 'cloud';
  mocks.supportsLocalAppMode = false;
});

describe('LocalCloudToggle · Local is refused where it cannot run', () => {
  it('does not switch to Local in the browser build, and says why', async () => {
    const user = userEvent.setup();
    await renderToggle();

    const local = screen.getByRole('tab', { name: /local/i });
    expect(local.getAttribute('aria-disabled')).toBe('true');
    expect(local.getAttribute('title')).toContain('desktop app');

    await user.click(local);
    expect(mocks.setMode).not.toHaveBeenCalled();
  });

  it('still switches to Cloud from the same control', async () => {
    const user = userEvent.setup();
    mocks.mode = 'local';
    await renderToggle();

    await user.click(screen.getByRole('tab', { name: /cloud/i }));
    expect(mocks.setMode).toHaveBeenCalledWith('cloud');
  });

  it('switches to Local normally when the desktop host supports it', async () => {
    const user = userEvent.setup();
    mocks.supportsLocalAppMode = true;
    await renderToggle();

    const local = screen.getByRole('tab', { name: /local/i });
    expect(local.getAttribute('aria-disabled')).toBeNull();

    await user.click(local);
    expect(mocks.setMode).toHaveBeenCalledWith('local');
  });

  it('refuses the same switch from the collapsed single-button form', async () => {
    const user = userEvent.setup();
    await renderToggle(true);

    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('title')).toContain('desktop app');

    await user.click(button);
    expect(mocks.setMode).not.toHaveBeenCalled();
  });

  it('collapsed form still switches away from Local when Local is the active mode', async () => {
    const user = userEvent.setup();
    mocks.mode = 'local';
    await renderToggle(true);

    await user.click(screen.getByRole('button'));
    expect(mocks.setMode).toHaveBeenCalledWith('cloud');
  });
});
