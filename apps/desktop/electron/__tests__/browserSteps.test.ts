import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock('electron', () => ({}));
vi.mock('../runtime/permissionManager', () => ({
  getPermissionState: () => 'granted',
  requestPermission: vi.fn(),
  consumeSingleUse: vi.fn(),
}));
vi.mock('../runtime/devicePrompts', () => ({ showDevicePrompt: vi.fn() }));
vi.mock('../browser/bridgeServer', () => ({
  sendBrowserCommand: (...args: unknown[]) => mocks.send(...args),
  recordBrowserActivity: vi.fn(() => 'activity-1'),
  settleBrowserActivity: vi.fn(),
}));

import { BrowserStepRefused, runBrowserStep } from '../browser/browserSteps';

const RULES = { allow: [], deny: ['blocked.example'] };

function tabsOn(url: string) {
  return [
    { tabId: 1, title: 'Other', url: 'https://elsewhere.example/', active: false },
    { tabId: 2, title: 'Active', url, active: true },
  ];
}

describe('the paired browser under the workspace website rules', () => {
  beforeEach(() => {
    mocks.send.mockReset();
  });

  it('refuses to open a blocked address without touching the browser', async () => {
    await expect(
      runBrowserStep(null, {
        command: 'browser_navigate',
        args: { url: 'https://docs.blocked.example/' },
        siteRules: RULES,
      }),
    ).rejects.toBeInstanceOf(BrowserStepRefused);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('goes back and reports it when a page redirects to a blocked site', async () => {
    mocks.send.mockImplementation(async (command: string) => {
      if (command === 'browser_navigate') return { url: 'https://short.link/x' };
      if (command === 'browser_list_tabs') return tabsOn('https://blocked.example./landing');
      return {};
    });

    await expect(
      runBrowserStep(null, {
        command: 'browser_navigate',
        args: { url: 'https://short.link/x' },
        siteRules: RULES,
      }),
    ).rejects.toThrow(/does not allow/);
    expect(mocks.send).toHaveBeenCalledWith('browser_history', { direction: 'back' });
  });

  it('withholds a page read from a blocked site', async () => {
    mocks.send.mockResolvedValue({ url: 'https://blocked.example/', title: 't', text: 'secret' });

    await expect(
      runBrowserStep(null, { command: 'browser_read_page', args: {}, siteRules: RULES }),
    ).rejects.toThrow(/nothing from it was read/);
  });

  it('returns the result when the step lands on an allowed page', async () => {
    mocks.send.mockImplementation(async (command: string) => {
      if (command === 'browser_click') return { clicked: true };
      if (command === 'browser_list_tabs') return tabsOn('https://fine.example/next');
      return {};
    });

    await expect(
      runBrowserStep(null, {
        command: 'browser_click',
        args: { selector: '#next' },
        siteRules: RULES,
      }),
    ).resolves.toEqual({ clicked: true });
  });

  it('checks nothing when the workspace set no rules', async () => {
    mocks.send.mockResolvedValue({ clicked: true });

    await runBrowserStep(null, { command: 'browser_click', args: { selector: '#next' } });

    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
