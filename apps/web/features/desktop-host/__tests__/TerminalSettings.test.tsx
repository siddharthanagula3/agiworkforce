import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TerminalSettings } from '../components/TerminalSettings';

const SAVED = { cursorStyle: 'block', cursorBlink: true, copyOnSelect: false, scrollback: 5_000 };

function installHost(terminal: unknown = SAVED) {
  const writePreferences = vi.fn(async (patch: { terminal: unknown }) => ({
    preferences: { terminal: patch.terminal },
  }));
  Object.assign(window, {
    agiHost: {
      shell: 'electron',
      platform: 'electron-darwin',
      appVersion: '1.2.0',
      onRuntimeEvent: vi.fn(() => () => undefined),
      onDeepLink: vi.fn(() => () => undefined),
      onVoiceHotkey: vi.fn(() => () => undefined),
      onHostCommand: vi.fn(() => () => undefined),
      invokeRuntime: vi.fn(),
      readPreferences: vi.fn(async () => ({
        preferences: terminal === null ? {} : { terminal },
      })),
      writePreferences,
    },
  });
  return { writePreferences };
}

afterEach(() => {
  Reflect.deleteProperty(window, 'agiHost');
});

describe('terminal settings', () => {
  it('saves each change on top of the rest of the saved choices', async () => {
    const user = userEvent.setup();
    const { writePreferences } = installHost();
    render(<TerminalSettings />);

    await user.selectOptions(await screen.findByLabelText('Cursor'), 'underline');
    await waitFor(() =>
      expect(writePreferences).toHaveBeenLastCalledWith({
        terminal: { ...SAVED, cursorStyle: 'underline' },
      }),
    );
    await user.click(screen.getByRole('switch', { name: 'Copy on select' }));
    await waitFor(() =>
      expect(writePreferences).toHaveBeenLastCalledWith({
        terminal: { ...SAVED, cursorStyle: 'underline', copyOnSelect: true },
      }),
    );
    await user.selectOptions(screen.getByLabelText('Scrollback'), '50000');
    await waitFor(() =>
      expect(writePreferences).toHaveBeenLastCalledWith({
        terminal: { ...SAVED, cursorStyle: 'underline', copyOnSelect: true, scrollback: 50_000 },
      }),
    );
  });

  it('states the limits the shell runs under', async () => {
    installHost();
    render(<TerminalSettings />);
    expect(await screen.findByText(/including no network while they are on/)).toBeInTheDocument();
  });

  it('stays hidden in a shell that does not keep terminal settings', async () => {
    installHost(null);
    const { container } = render(<TerminalSettings />);
    await waitFor(() => expect(window.agiHost?.readPreferences).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
