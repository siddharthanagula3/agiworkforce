import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HOST_SHORTCUT_CHOICES,
  NO_HOST_SHORTCUT,
  describeAccelerator,
  type DeveloperRuntimeStatus,
  type HostPreferences,
  type HostPreferencesState,
} from '@agiworkforce/local-runtime-contract';
import { DesktopSettingsSection } from '../components/DesktopSettingsSection';

const DEFAULT_STATE: HostPreferencesState = {
  preferences: {
    launchAtLogin: false,
    quickAskShortcut: HOST_SHORTCUT_CHOICES.quickAsk[0] as string,
    screenshotShortcut: HOST_SHORTCUT_CHOICES.screenshot[0] as string,
    voiceShortcut: HOST_SHORTCUT_CHOICES.voice[0] as string,
    showInMenuBar: true,
    cliPath: '',
  },
  shortcutStatus: { quickAsk: 'registered', screenshot: 'registered', voice: 'registered' },
};

const RESOLVED_CLI: DeveloperRuntimeStatus = {
  available: true,
  name: 'agi',
  version: '1.7.1',
  path: '~/.cargo/bin/agi',
  hint: null,
  accountSyncError: null,
};

const MISSING_CLI: DeveloperRuntimeStatus = {
  available: false,
  name: 'agi',
  version: null,
  path: null,
  hint: 'Install the AGI CLI from agiworkforce.com/download.',
  accountSyncError: null,
};

const REFUSED_ACCOUNT_CLI: DeveloperRuntimeStatus = {
  ...RESOLVED_CLI,
  accountSyncError: 'Device sign-in is turned off for this account.',
};

function installHost(
  overrides: Partial<HostPreferencesState> = {},
  cli: DeveloperRuntimeStatus = RESOLVED_CLI,
) {
  const state: HostPreferencesState = {
    preferences: { ...DEFAULT_STATE.preferences, ...overrides.preferences },
    shortcutStatus: { ...DEFAULT_STATE.shortcutStatus, ...overrides.shortcutStatus },
  };
  const writePreferences = vi.fn(async (patch: Partial<HostPreferences>) => {
    state.preferences = { ...state.preferences, ...patch };
    return { preferences: state.preferences, shortcutStatus: state.shortcutStatus };
  });
  Object.assign(window, {
    agiHost: {
      platform: 'electron-darwin',
      appVersion: '1.2.0',
      readPreferences: vi.fn(async () => state),
      writePreferences,
      checkForUpdate: vi.fn(async () => ({
        available: false,
        currentVersion: '1.2.0',
        version: '1.2.0',
        downloadUrl: '',
      })),
      openUpdateInstaller: vi.fn(),
      onDeepLink: vi.fn(() => () => undefined),
      onVoiceHotkey: vi.fn(() => () => undefined),
      onRuntimeEvent: vi.fn(() => () => undefined),
      onHostCommand: vi.fn(() => () => undefined),
      invokeRuntime: vi.fn(async (command: string) =>
        command === 'developer_runtime_status'
          ? { ok: true, value: cli }
          : { ok: false, error: { code: 'unknown-command', message: command } },
      ),
      openExternal: vi.fn(),
      notify: vi.fn(),
    },
  });
  return { writePreferences };
}

afterEach(() => {
  Reflect.deleteProperty(window, 'agiHost');
  vi.restoreAllMocks();
});

describe('the desktop settings section', () => {
  it('names the AGI CLI it would run, with its version and where it lives', async () => {
    installHost();

    render(<DesktopSettingsSection />);

    expect(await screen.findByText('Using agi 1.7.1 from ~/.cargo/bin/agi')).toBeInTheDocument();
  });

  it('says the CLI is missing, and what to do about it', async () => {
    installHost({}, MISSING_CLI);

    render(<DesktopSettingsSection />);

    expect(
      await screen.findByText(
        'Not found on this computer. Install the AGI CLI to run coding sessions here. Install the AGI CLI from agiworkforce.com/download.',
      ),
    ).toBeInTheDocument();
  });

  it('says the account could not be given to the CLI, and why', async () => {
    installHost({}, REFUSED_ACCOUNT_CLI);

    render(<DesktopSettingsSection />);

    const note = await screen.findByText(
      'Using agi 1.7.1 from ~/.cargo/bin/agi. This account could not be given to the AGI CLI on this computer. Device sign-in is turned off for this account.',
    );
    expect(note).toBeInTheDocument();
  });

  it('renders nothing in a browser', () => {
    const { container } = render(<DesktopSettingsSection />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the rows from what the shell reports', async () => {
    installHost();
    render(<DesktopSettingsSection />);

    await waitFor(() => expect(screen.getByLabelText('Run on startup')).toBeEnabled());
    expect(screen.getByLabelText('Run on startup')).not.toBeChecked();
    expect(screen.getByLabelText('Menu bar')).toBeChecked();
    expect(screen.getByLabelText('Quick Ask shortcut')).toHaveValue(
      HOST_SHORTCUT_CHOICES.quickAsk[0],
    );
    // The chord is shown the way the platform writes it, not as the portable
    // token the shell registers.
    expect(screen.getByLabelText('Quick Ask shortcut')).toHaveDisplayValue(
      describeAccelerator(HOST_SHORTCUT_CHOICES.quickAsk[0] as string, 'electron-darwin'),
    );
    // The version already has its own row, and the bridge's platform value is
    // an id to branch on rather than something to show anyone.
    expect(screen.getByText('AGI Cloud on macOS')).toBeInTheDocument();
    expect(screen.queryByText(/electron-darwin/u)).not.toBeInTheDocument();
  });

  it('offers no shortcut beside the presets, and no literal of its own', async () => {
    installHost();
    render(<DesktopSettingsSection />);

    const select = await screen.findByLabelText('Voice shortcut');
    const values = [...select.querySelectorAll('option')].map((option) => option.value);

    expect(values).toEqual([...HOST_SHORTCUT_CHOICES.voice, NO_HOST_SHORTCUT]);
    expect(within(select).getByRole('option', { name: 'No shortcut' })).toBeInTheDocument();
  });

  it('writes a switch through the bridge and keeps what comes back', async () => {
    const { writePreferences } = installHost();
    render(<DesktopSettingsSection />);

    const startup = await screen.findByLabelText('Run on startup');
    await waitFor(() => expect(startup).toBeEnabled());
    await userEvent.click(startup);

    expect(writePreferences).toHaveBeenCalledWith({ launchAtLogin: true });
    await waitFor(() => expect(screen.getByLabelText('Run on startup')).toBeChecked());
  });

  it('writes a chosen shortcut through the bridge', async () => {
    const { writePreferences } = installHost();
    render(<DesktopSettingsSection />);

    const select = await screen.findByLabelText('Screenshot to chat shortcut');
    await waitFor(() => expect(select).toBeEnabled());
    await userEvent.selectOptions(select, HOST_SHORTCUT_CHOICES.screenshot[1] as string);

    expect(writePreferences).toHaveBeenCalledWith({
      screenshotShortcut: HOST_SHORTCUT_CHOICES.screenshot[1],
    });
  });

  // A control that silently did nothing would be worse than no control: the
  // shell tells the panel the chord did not take, and the panel says so.
  it('says why a shortcut did not take', async () => {
    installHost({ shortcutStatus: { quickAsk: 'taken', screenshot: 'duplicate', voice: 'off' } });
    render(<DesktopSettingsSection />);

    expect(await screen.findByText('Already used by another app.')).toBeInTheDocument();
    expect(screen.getByText('Already used by another AGI Cloud shortcut.')).toBeInTheDocument();
  });

  it('shows nothing extra when every shortcut registered', async () => {
    installHost();
    render(<DesktopSettingsSection />);

    await screen.findByLabelText('Quick Ask shortcut');
    expect(screen.queryByText(/Already used by/u)).not.toBeInTheDocument();
  });
});
