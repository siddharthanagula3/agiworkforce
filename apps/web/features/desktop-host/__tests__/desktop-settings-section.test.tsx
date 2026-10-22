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
import { HOSTED_SETTINGS_NAV_FIELDS } from '@/features/settings/components/web-settings-navigation';

const DEFAULT_STATE: HostPreferencesState = {
  preferences: {
    launchAtLogin: false,
    quickAskShortcut: HOST_SHORTCUT_CHOICES.quickAsk[0] as string,
    screenshotShortcut: HOST_SHORTCUT_CHOICES.screenshot[0] as string,
    windowShotShortcut: HOST_SHORTCUT_CHOICES.windowShot[0] as string,
    voiceShortcut: HOST_SHORTCUT_CHOICES.voice[0] as string,
    showInMenuBar: true,
    cliPath: '',
    sessionCompletionAlerts: 'background',
    sessionApprovalAlerts: true,
  },
  shortcutStatus: {
    quickAsk: 'registered',
    screenshot: 'registered',
    windowShot: 'registered',
    voice: 'registered',
  },
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

  it.each([
    ['bundled', 'Bundled with the app', '/Applications/AGI Desktop.app/Contents/Resources/agi'],
    ['custom', 'Custom path', '/opt/agi/bin/agi'],
    ['path', 'From PATH', '/usr/local/bin/agi'],
  ] as const)('says where a %s CLI came from', async (source, label, cliPath) => {
    installHost({}, { ...RESOLVED_CLI, source, path: cliPath });

    render(<DesktopSettingsSection />);

    expect(
      await screen.findByText(`${label}. Using agi 1.7.1 from ${cliPath}`),
    ).toBeInTheDocument();
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
    expect(screen.getByText('AGI Desktop on macOS')).toBeInTheDocument();
    expect(screen.queryByText(/electron-darwin/u)).not.toBeInTheDocument();
  });

  it('offers dictation into other apps only where the shell reports it, and writes the switch', async () => {
    const { writePreferences } = installHost({
      preferences: { ...DEFAULT_STATE.preferences, dictateIntoFocusedApp: false },
    });
    render(<DesktopSettingsSection />);

    const toggle = await screen.findByLabelText('Dictate into the app you are using');
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(writePreferences).toHaveBeenCalledWith({ dictateIntoFocusedApp: true });
  });

  it('shows no dictation-into-apps switch to a shell that does not report it', async () => {
    installHost();
    render(<DesktopSettingsSection />);

    await screen.findByLabelText('Menu bar');
    expect(screen.queryByLabelText('Dictate into the app you are using')).not.toBeInTheDocument();
  });

  it('offers keep computer awake where the shell reports it, on by default, and writes it', async () => {
    const { writePreferences } = installHost({
      preferences: { ...DEFAULT_STATE.preferences, preventSleepWhileRunning: true },
    });
    render(<DesktopSettingsSection />);

    const toggle = await screen.findByRole('switch', { name: 'Keep computer awake' });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    expect(writePreferences).toHaveBeenCalledWith({ preventSleepWhileRunning: false });
    await waitFor(() => expect(toggle).not.toBeChecked());
  });

  it('shows no keep-awake switch to a shell that does not report it', async () => {
    installHost();
    render(<DesktopSettingsSection />);

    await screen.findByLabelText('Menu bar');
    expect(screen.queryByLabelText('Keep computer awake')).not.toBeInTheDocument();
  });

  it('offers draw attention, off by default, only where the shell reports it', async () => {
    const { writePreferences } = installHost({
      preferences: {
        ...DEFAULT_STATE.preferences,
        agentNotifications: { when: 'unfocused', muted: [], sound: true, drawAttention: false },
      },
    });
    render(<DesktopSettingsSection />);

    const toggle = await screen.findByRole('switch', { name: 'Draw attention' });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/Bounce the Dock icon/u)).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(writePreferences).toHaveBeenLastCalledWith({
      agentNotifications: { when: 'unfocused', muted: [], sound: true, drawAttention: true },
      sessionCompletionAlerts: 'background',
      sessionApprovalAlerts: true,
    });

    await userEvent.selectOptions(screen.getByLabelText('Agent notifications'), 'never');
    await waitFor(() => expect(screen.getByLabelText('Draw attention')).toBeDisabled());
  });

  it('shows no draw attention switch to a shell whose notifications lack it', async () => {
    installHost({
      preferences: {
        ...DEFAULT_STATE.preferences,
        agentNotifications: { when: 'unfocused', muted: [], sound: true },
      },
    });
    render(<DesktopSettingsSection />);

    await screen.findByLabelText('Agent notifications');
    expect(screen.queryByLabelText('Draw attention')).not.toBeInTheDocument();
  });

  it('offers no shortcut beside the presets, and no literal of its own', async () => {
    installHost();
    render(<DesktopSettingsSection />);

    const select = await screen.findByLabelText('Voice shortcut');
    const values = [...select.querySelectorAll('option')].map((option) => option.value);

    expect(values).toEqual([...HOST_SHORTCUT_CHOICES.voice, NO_HOST_SHORTCUT]);
    expect(within(select).getByRole('option', { name: 'No shortcut' })).toBeInTheDocument();
  });

  it('never offers no shortcut for Stop Agents, which the shell refuses', async () => {
    installHost();
    render(<DesktopSettingsSection />);

    const select = await screen.findByLabelText('Stop agents shortcut');
    const values = [...select.querySelectorAll('option')].map((option) => option.value);

    expect(values).toEqual([...HOST_SHORTCUT_CHOICES.stop]);
    expect(within(select).queryByRole('option', { name: 'No shortcut' })).not.toBeInTheDocument();
  });

  it('says a setting was not saved, not that it could not be read, when the write fails', async () => {
    const { writePreferences } = installHost();
    writePreferences.mockRejectedValueOnce(new Error(''));
    render(<DesktopSettingsSection />);

    const startup = await screen.findByLabelText('Run on startup');
    await waitFor(() => expect(startup).toBeEnabled());
    await userEvent.click(startup);

    expect(await screen.findByRole('alert')).toHaveTextContent('That setting was not saved.');
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
    installHost({
      shortcutStatus: {
        quickAsk: 'taken',
        screenshot: 'duplicate',
        windowShot: 'off',
        voice: 'off',
      },
    });
    render(<DesktopSettingsSection />);

    expect(await screen.findByText('Already used by another app.')).toBeInTheDocument();
    expect(screen.getByText('Already used by another AGI Desktop shortcut.')).toBeInTheDocument();
  });

  // The shell asks the user natively before it saves a new CLI path, so what
  // comes back may be the old path, and the status is only worth reading once
  // that answer is in.
  it('keeps the path the shell kept, and resolves the CLI only after it answered', async () => {
    const { writePreferences } = installHost();
    let answer: (state: HostPreferencesState) => void = () => undefined;
    writePreferences.mockImplementationOnce(
      () =>
        new Promise<HostPreferencesState>((resolve) => {
          answer = resolve;
        }),
    );
    const invokeRuntime = (
      window as unknown as { agiHost: { invokeRuntime: ReturnType<typeof vi.fn> } }
    ).agiHost.invokeRuntime;
    const cliReads = () =>
      invokeRuntime.mock.calls.filter(([command]) => command === 'developer_runtime_status').length;
    render(<DesktopSettingsSection />);

    const field = await screen.findByLabelText('AGI CLI path');
    await waitFor(() => expect(field).toBeEnabled());
    await waitFor(() => expect(cliReads()).toBe(1));
    await userEvent.type(field, '/tmp/not-the-cli');
    await userEvent.tab();

    expect(writePreferences).toHaveBeenCalledWith({ cliPath: '/tmp/not-the-cli' });
    expect(cliReads()).toBe(1);

    answer(DEFAULT_STATE);

    await waitFor(() => expect(cliReads()).toBe(2));
    expect(screen.getByLabelText('AGI CLI path')).toHaveValue('');
  });

  it('offers the stop shortcut and agent notifications only when the shell reports them', async () => {
    installHost();
    render(<DesktopSettingsSection />);

    await screen.findByLabelText('Quick Ask shortcut');
    expect(screen.queryByLabelText('Stop agents shortcut')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Agent notifications')).not.toBeInTheDocument();
  });

  it('writes the stop shortcut through the bridge', async () => {
    const { writePreferences } = installHost({
      preferences: {
        ...DEFAULT_STATE.preferences,
        stopShortcut: HOST_SHORTCUT_CHOICES.stop[0] as string,
      },
      shortcutStatus: { stop: 'registered' },
    });
    render(<DesktopSettingsSection />);

    const select = await screen.findByLabelText('Stop agents shortcut');
    await waitFor(() => expect(select).toBeEnabled());
    await userEvent.selectOptions(select, HOST_SHORTCUT_CHOICES.stop[1] as string);

    expect(writePreferences).toHaveBeenCalledWith({ stopShortcut: HOST_SHORTCUT_CHOICES.stop[1] });
  });

  it('writes when, which kinds and whether agent notifications make a sound', async () => {
    const { writePreferences } = installHost({
      preferences: {
        ...DEFAULT_STATE.preferences,
        agentNotifications: { when: 'unfocused', muted: [], sound: true },
      },
    });
    render(<DesktopSettingsSection />);

    const mode = await screen.findByLabelText('Agent notifications');
    expect(mode).toHaveDisplayValue('Only when AGI Desktop is in the background');

    expect(screen.getByLabelText('Questions')).toBeChecked();
    await userEvent.click(screen.getByLabelText('Finished turns'));
    expect(writePreferences).toHaveBeenLastCalledWith({
      agentNotifications: { when: 'unfocused', muted: ['turn-complete'], sound: true },
      sessionCompletionAlerts: 'background',
      sessionApprovalAlerts: true,
    });
    await waitFor(() => expect(screen.getByLabelText('Finished turns')).not.toBeChecked());

    await userEvent.click(screen.getByLabelText('Notification sound'));
    expect(writePreferences).toHaveBeenLastCalledWith({
      agentNotifications: { when: 'unfocused', muted: ['turn-complete'], sound: false },
      sessionCompletionAlerts: 'background',
      sessionApprovalAlerts: true,
    });

    await userEvent.selectOptions(screen.getByLabelText('Agent notifications'), 'never');
    expect(writePreferences).toHaveBeenLastCalledWith({
      agentNotifications: { when: 'never', muted: ['turn-complete'], sound: false },
      sessionCompletionAlerts: 'background',
      sessionApprovalAlerts: true,
    });
    await waitFor(() => expect(screen.getByLabelText('Approval requests')).toBeDisabled());
    expect(screen.getByLabelText('Questions')).toBeDisabled();
  });

  it('shows one set of notification choices, and keeps what the older alert rows saved', async () => {
    installHost({
      preferences: {
        ...DEFAULT_STATE.preferences,
        sessionCompletionAlerts: 'never',
        sessionApprovalAlerts: false,
        agentNotifications: { when: 'unfocused', muted: [], sound: true },
      },
    });
    render(<DesktopSettingsSection />);

    await screen.findByLabelText('Agent notifications');
    expect(screen.queryByLabelText('Task finished alerts')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Approval alerts')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Finished turns')).not.toBeChecked();
    expect(screen.getByLabelText('Failed turns')).not.toBeChecked();
    expect(screen.getByLabelText('Approval requests')).not.toBeChecked();
    expect(screen.getByLabelText('Questions')).toBeChecked();
  });

  it('keeps the older alert rows for a shell that has no agent notifications', async () => {
    installHost();
    render(<DesktopSettingsSection />);

    expect(await screen.findByLabelText('Task finished alerts')).toBeInTheDocument();
    expect(screen.getByLabelText('Approval alerts')).toBeInTheDocument();
  });

  it('shows nothing extra when every shortcut registered', async () => {
    installHost();
    render(<DesktopSettingsSection />);

    await screen.findByLabelText('Quick Ask shortcut');
    expect(screen.queryByText(/Already used by/u)).not.toBeInTheDocument();
  });
});

describe('the desktop settings section search index', () => {
  it('renders every control the settings search lists under the desktop app', async () => {
    installHost();

    render(<DesktopSettingsSection />);

    const fields = HOSTED_SETTINGS_NAV_FIELDS.desktop ?? [];
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      expect(await screen.findByRole('switch', { name: field.label })).toBeInTheDocument();
    }
  });
});
