import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BrowserPairingState,
  ComputerUseStatus,
  DesktopPermissionsReview,
  RefusableApplication,
  ReviewedPermission,
} from '@agiworkforce/local-runtime-contract';
import { HOSTED_SETTINGS_NAV_FIELDS } from '@/features/settings/components/web-settings-navigation';
import { ComputerUseSettings } from '../components/ComputerUseSettings';
import { DesktopPermissionsSection } from '../components/DesktopPermissionsSection';

const STATUS: ComputerUseStatus = {
  enabled: false,
  available: true,
  unavailableReason: null,
  grant: 'prompt',
  phase: 'idle',
  pausedBy: null,
  stopShortcut: 'Escape',
  system: { accessibility: 'granted', screenRecording: 'granted' },
};

const PAIRING: BrowserPairingState = {
  bridgePort: 4000,
  bridgeListening: true,
  paired: true,
  extensionId: 'ext',
  fingerprint: 'fp',
  pairedAtMs: 1,
  connected: true,
  hostInstalled: true,
  installedManifestPaths: [],
  pendingRequest: null,
};

const SAFARI_ALLOWED: ReviewedPermission = {
  capability: 'application.control',
  scope: { kind: 'application', target: 'com.apple.Safari' },
  state: 'granted',
  duration: 'session',
  decidedAtMs: 2,
  description: 'control Safari',
};

const MAIL_REFUSED: ReviewedPermission = {
  capability: 'application.control',
  scope: { kind: 'application', target: 'com.apple.mail' },
  state: 'denied',
  duration: 'always',
  decidedAtMs: 3,
  description: 'control Mail',
};

const FOLDER_READ: ReviewedPermission = {
  capability: 'filesystem.read',
  scope: { kind: 'workspace', target: '/Users/me/code' },
  state: 'granted',
  duration: 'always',
  decidedAtMs: 4,
  description: 'read files in /Users/me/code',
};

function review(decisions: ReviewedPermission[]): DesktopPermissionsReview {
  return {
    decisions,
    system: { 'screen-recording': 'granted', accessibility: 'granted', microphone: 'denied' },
  };
}

const INSTALLED: RefusableApplication[] = [
  { name: 'Mail', bundleId: 'com.apple.mail' },
  { name: 'Notes', bundleId: 'com.apple.Notes' },
  { name: 'Terminal', bundleId: 'com.apple.Terminal' },
];

function installHost({
  status = STATUS,
  pairing = PAIRING as BrowserPairingState | null,
  decisions = [] as ReviewedPermission[],
  installed = INSTALLED as RefusableApplication[] | null,
} = {}) {
  let current = review(decisions);
  const invokeRuntime = vi.fn(async (command: string, args?: Record<string, unknown>) => {
    switch (command) {
      case 'computer_use_status':
        return { ok: true, value: status };
      case 'browser_pairing_state':
        return pairing
          ? { ok: true, value: pairing }
          : { ok: false, error: { code: 'io-error', message: 'down' } };
      case 'permission_review':
        return { ok: true, value: current };
      case 'permission_revoke': {
        const scope = args?.['scope'] as { target?: string };
        current = review(current.decisions.filter((d) => d.scope.target !== scope.target));
        return { ok: true, value: current };
      }
      case 'permission_application_list':
        return installed
          ? { ok: true, value: installed }
          : {
              ok: false,
              error: { code: 'io-error', message: 'Installed apps could not be read.' },
            };
      case 'permission_deny': {
        const scope = args?.['scope'] as { kind: 'application'; target: string };
        const app = INSTALLED.find((entry) => entry.bundleId === scope.target);
        current = review([
          {
            capability: 'application.control',
            scope,
            state: 'denied',
            duration: 'always',
            decidedAtMs: 9,
            description: `control ${app?.name ?? scope.target}`,
          },
          ...current.decisions.filter((d) => d.scope.target !== scope.target),
        ]);
        return { ok: true, value: current };
      }
      default:
        return { ok: false, error: { code: 'unknown-command', message: command } };
    }
  });
  Object.assign(window, {
    agiHost: {
      shell: 'electron',
      platform: 'electron-darwin',
      appVersion: '1.2.0',
      onRuntimeEvent: vi.fn(() => () => undefined),
      onDeepLink: vi.fn(() => () => undefined),
      onVoiceHotkey: vi.fn(() => () => undefined),
      onHostCommand: vi.fn(() => () => undefined),
      invokeRuntime,
    },
  });
  return { invokeRuntime };
}

afterEach(() => {
  Reflect.deleteProperty(window, 'agiHost');
  vi.restoreAllMocks();
});

describe('the computer use page', () => {
  it('renders nothing in a browser', () => {
    const { container } = render(<ComputerUseSettings />);

    expect(container).toBeEmptyDOMElement();
  });

  it('puts the any-app switch and the Chrome connection under Control', async () => {
    const { invokeRuntime } = installHost();
    render(<ComputerUseSettings />);

    const control = await screen.findByRole('region', { name: 'Control' });
    const anyApp = within(control).getByRole('switch', { name: 'Any app' });
    await waitFor(() => expect(anyApp).toBeEnabled());
    expect(anyApp).not.toBeChecked();
    expect(await within(control).findByText('Connected')).toBeInTheDocument();
    expect(within(control).getByRole('link', { name: 'Manage' })).toHaveAttribute(
      'href',
      '/settings/capabilities',
    );

    await userEvent.click(anyApp);
    expect(invokeRuntime).toHaveBeenCalledWith('computer_use_set_enabled', { enabled: true });
  });

  it.each([
    [{ ...PAIRING, connected: false }, 'Paired, but Chrome is not connected right now'],
    [{ ...PAIRING, paired: false, connected: false }, 'AGI Extension not paired'],
    [{ ...PAIRING, hostInstalled: false }, 'Chrome cannot reach this app'],
    [null, 'The browser connection could not be read.'],
  ])('says how Chrome is connected', async (pairing, text) => {
    installHost({ pairing });
    render(<ComputerUseSettings />);

    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('says none yet when no app has an answer', async () => {
    installHost({ decisions: [FOLDER_READ] });
    render(<ComputerUseSettings />);

    const allowed = await screen.findByRole('region', { name: 'Allowed apps' });
    const refused = screen.getByRole('region', { name: 'Refused apps' });
    expect(within(allowed).getByText('None yet')).toBeInTheDocument();
    expect(
      within(refused).getByText('None yet. AGI does not control an app you add here.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Read files in /Users/me/code')).not.toBeInTheDocument();
  });

  it('lists allowed and refused apps, and removing one asks the shell', async () => {
    const { invokeRuntime } = installHost({ decisions: [SAFARI_ALLOWED, MAIL_REFUSED] });
    render(<ComputerUseSettings />);

    const allowed = await screen.findByRole('region', { name: 'Allowed apps' });
    expect(within(allowed).getByText('Control Safari')).toBeInTheDocument();
    expect(within(allowed).getByText('Allowed until you quit the app')).toBeInTheDocument();
    const refused = screen.getByRole('region', { name: 'Refused apps' });
    expect(within(refused).getByText('Control Mail')).toBeInTheDocument();
    expect(within(refused).getByText('Always refused')).toBeInTheDocument();

    await userEvent.click(within(allowed).getByRole('button', { name: 'Remove: Control Safari' }));

    expect(invokeRuntime).toHaveBeenCalledWith('permission_revoke', {
      capability: 'application.control',
      scope: SAFARI_ALLOWED.scope,
    });
    await waitFor(() => expect(within(allowed).getByText('None yet')).toBeInTheDocument());
  });
});

describe('refusing an app from the page', () => {
  it('links the any-app switch to the computer use help article', async () => {
    installHost();
    render(<ComputerUseSettings />);

    const link = await screen.findByRole('link', { name: 'Learn more about computer use' });
    expect(link).toHaveAttribute('href', '/help/computer-use');
    expect(link).toHaveTextContent('Learn more');
  });

  it('offers installed apps not yet refused, filters by name, and refuses the one picked', async () => {
    const { invokeRuntime } = installHost({ decisions: [MAIL_REFUSED, SAFARI_ALLOWED] });
    render(<ComputerUseSettings />);

    const refused = await screen.findByRole('region', { name: 'Refused apps' });
    await userEvent.click(within(refused).getByRole('button', { name: 'Add app' }));

    const list = await screen.findByRole('listbox', { name: 'Installed apps' });
    expect(within(list).queryByRole('option', { name: 'Mail' })).not.toBeInTheDocument();
    expect(within(list).getByRole('option', { name: 'Notes' })).toBeInTheDocument();

    await userEvent.type(screen.getByRole('combobox', { name: 'Search apps' }), 'term');
    expect(screen.queryByRole('option', { name: 'Notes' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: 'Terminal' }));

    expect(invokeRuntime).toHaveBeenCalledWith('permission_deny', {
      capability: 'application.control',
      scope: { kind: 'application', target: 'com.apple.Terminal' },
    });
    expect(await within(refused).findByText('Control Terminal')).toBeInTheDocument();
    expect(within(refused).getByText('Control Mail')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('picks the highlighted app with the keyboard', async () => {
    const { invokeRuntime } = installHost();
    render(<ComputerUseSettings />);

    await userEvent.click(await screen.findByRole('button', { name: 'Add app' }));
    await screen.findByRole('listbox', { name: 'Installed apps' });
    await userEvent.type(
      screen.getByRole('combobox', { name: 'Search apps' }),
      '{ArrowDown}{Enter}',
    );

    expect(invokeRuntime).toHaveBeenCalledWith('permission_deny', {
      capability: 'application.control',
      scope: { kind: 'application', target: 'com.apple.Notes' },
    });
  });

  it('says what adding does while nothing is refused', async () => {
    installHost();
    render(<ComputerUseSettings />);

    const refused = await screen.findByRole('region', { name: 'Refused apps' });
    expect(
      within(refused).getByText('None yet. AGI does not control an app you add here.'),
    ).toBeInTheDocument();
  });

  it('says so when the installed apps cannot be read', async () => {
    installHost({ installed: null });
    render(<ComputerUseSettings />);

    await userEvent.click(await screen.findByRole('button', { name: 'Add app' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Installed apps could not be read.');
  });

  it('offers no Add app where computer use cannot run', async () => {
    installHost({
      status: { ...STATUS, available: false, unavailableReason: 'macOS only' },
    });
    render(<ComputerUseSettings />);

    const refused = await screen.findByRole('region', { name: 'Refused apps' });
    expect(within(refused).getByText('None yet')).toBeInTheDocument();
    expect(within(refused).queryByRole('button', { name: 'Add app' })).not.toBeInTheDocument();
  });
});

describe('the permissions section', () => {
  it('keeps app answers on the computer use page and re-reads system settings on Refresh', async () => {
    const { invokeRuntime } = installHost({ decisions: [SAFARI_ALLOWED, FOLDER_READ] });
    render(<DesktopPermissionsSection />);

    expect(await screen.findByText('Read files in /Users/me/code')).toBeInTheDocument();
    expect(screen.queryByText('Control Safari')).not.toBeInTheDocument();

    const reads = () =>
      invokeRuntime.mock.calls.filter(([command]) => command === 'permission_review').length;
    const before = reads();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(reads()).toBe(before + 1));
  });
});

describe('the computer use page search index', () => {
  it('renders every control the settings search lists under computer use', async () => {
    installHost();
    render(<ComputerUseSettings />);

    const fields = HOSTED_SETTINGS_NAV_FIELDS['computer-use'] ?? [];
    expect(fields.length).toBeGreaterThan(0);
    await screen.findByRole('region', { name: 'Refused apps' });
    for (const field of fields) {
      expect(
        screen.queryByRole('switch', { name: field.label }) ??
          screen.queryByRole('region', { name: field.label }),
        field.label,
      ).toBeInTheDocument();
    }
  });
});
