import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AutomationCapabilitySupport,
  AutomationPermissions,
} from '@agiworkforce/desktop-command-client';

const mocks = vi.hoisted(() => ({
  checkAutomationPermissions: vi.fn(),
  requestAutomationPermission: vi.fn(),
}));

vi.mock('@agiworkforce/desktop-command-client', () => ({
  automation: {
    checkAutomationPermissions: mocks.checkAutomationPermissions,
    requestAutomationPermission: mocks.requestAutomationPermission,
  },
}));

import { AutomationPermissionsSettings } from './AutomationPermissionsSettings';

function permissions(
  grants: { accessibility: boolean; screenRecording: boolean; inputMonitoring: boolean },
  support: {
    accessibility: AutomationCapabilitySupport;
    others: AutomationCapabilitySupport;
    windowControlMissingProgram?: string;
  },
): AutomationPermissions {
  return {
    ...grants,
    automationServiceReady: true,
    support: {
      accessibility: support.accessibility,
      screenRecording: support.others,
      inputMonitoring: support.others,
      windowControlMissingProgram: support.windowControlMissingProgram ?? null,
    },
  };
}

const ALL_TRUE = { accessibility: true, screenRecording: true, inputMonitoring: true };

describe('AutomationPermissionsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestAutomationPermission.mockResolvedValue(undefined);
  });

  afterEach(() => cleanup());

  it('offers a grant only for a macOS permission that is missing', async () => {
    const user = userEvent.setup();
    mocks.checkAutomationPermissions.mockResolvedValue(
      permissions(
        { accessibility: true, screenRecording: false, inputMonitoring: true },
        { accessibility: 'needs_grant', others: 'needs_grant' },
      ),
    );
    render(<AutomationPermissionsSettings />);

    expect(await screen.findAllByText('Granted')).toHaveLength(2);
    expect(screen.getByText('Not granted')).toBeTruthy();

    const grant = screen.getByRole('button', { name: 'Grant' });
    await user.click(grant);
    expect(mocks.requestAutomationPermission).toHaveBeenCalledWith('screen_recording');
  });

  it('does not call a platform without grants "granted"', async () => {
    mocks.checkAutomationPermissions.mockResolvedValue(
      permissions(ALL_TRUE, { accessibility: 'no_grant_needed', others: 'no_grant_needed' }),
    );
    render(<AutomationPermissionsSettings />);

    expect(await screen.findAllByText('No permission needed on this platform')).toHaveLength(3);
    expect(screen.queryByText('Granted')).toBeNull();
    expect(screen.queryByText(/All permissions granted/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Grant' })).toBeNull();
    expect(screen.getByText(/no system permissions to grant/)).toBeTruthy();
  });

  it('says element-level control is not supported where there is no accessibility driver', async () => {
    mocks.checkAutomationPermissions.mockResolvedValue(
      permissions(ALL_TRUE, { accessibility: 'unsupported', others: 'no_grant_needed' }),
    );
    render(<AutomationPermissionsSettings />);

    expect(await screen.findByText('Not supported on this platform')).toBeTruthy();
    expect(screen.getByText(/works from screenshots instead/)).toBeTruthy();
    expect(screen.queryByText('Granted')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Grant' })).toBeNull();
  });

  it('names the program window control is missing', async () => {
    mocks.checkAutomationPermissions.mockResolvedValue(
      permissions(ALL_TRUE, {
        accessibility: 'unsupported',
        others: 'no_grant_needed',
        windowControlMissingProgram: 'wmctrl',
      }),
    );
    render(<AutomationPermissionsSettings />);

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain('Listing and switching windows is not available');
    expect(notice.textContent).toContain('wmctrl');
  });

  it('says so when the status cannot be read instead of showing three denials', async () => {
    mocks.checkAutomationPermissions.mockRejectedValue(new Error('ipc closed'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<AutomationPermissionsSettings />);

    expect((await screen.findByRole('alert')).textContent).toContain('could not be read');
    expect(screen.queryByText('Not granted')).toBeNull();
  });
});
