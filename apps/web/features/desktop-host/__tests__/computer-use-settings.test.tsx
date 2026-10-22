import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BrowserPairingState,
  ComputerUseStatus,
  DesktopPermissionsReview,
  ReviewedPermission,
} from '@agiworkforce/local-runtime-contract';
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

function installHost({
  status = STATUS,
  pairing = PAIRING as BrowserPairingState | null,
  decisions = [] as ReviewedPermission[],
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
    expect(within(refused).getByText('None yet')).toBeInTheDocument();
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
