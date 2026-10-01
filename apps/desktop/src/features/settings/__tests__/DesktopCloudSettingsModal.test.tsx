import { act, type ComponentProps } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsDataAdapter, SettingsModal } from '@agiworkforce/ui';
type ScanModule0 = typeof import('@agiworkforce/ui');
type ScanModule1 = typeof import('../../../utils/navigation');

const mocks = vi.hoisted(() => ({
  settingsModal: vi.fn((_props: unknown) => null),
  listConnectors: vi.fn(),
  connectConnector: vi.fn(),
  createCustomConnector: vi.fn(),
  deleteCustomConnector: vi.fn(),
  disconnectConnector: vi.fn(),
  listCloudSkills: vi.fn(),
  openExternalUrl: vi.fn(),
}));

// exactly the bug worth catching: 'safety' shipped in the real nav with no
vi.mock('@agiworkforce/ui', async () => {
  const actual = await vi.importActual<ScanModule0>('@agiworkforce/ui');
  return {
    ...actual,
    SettingsModal: mocks.settingsModal,
    SETTINGS_NAV_GROUPS_WEB: actual.SETTINGS_NAV_GROUPS_WEB,
  };
});

vi.mock('../../../api/cloudConnectors', () => ({
  listConnectors: mocks.listConnectors,
  connectConnector: mocks.connectConnector,
  createCustomConnector: mocks.createCustomConnector,
  deleteCustomConnector: mocks.deleteCustomConnector,
  disconnectConnector: mocks.disconnectConnector,
  customConnectorShortId: vi.fn(() => null),
  customConnectorSignInUrl: vi.fn((shortId: string) => `https://example.test/${shortId}`),
  getCustomConnectorOAuthRedirectUri: vi.fn(async () => null),
}));

vi.mock('../../../api/cloudSkills', () => ({
  listCloudSkills: mocks.listCloudSkills,
}));

vi.mock('../../../utils/navigation', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  openExternalUrl: mocks.openExternalUrl,
}));

import { WEB_APP_URL } from '../../../api/config';
import { DesktopCloudSettingsModal } from '../DesktopCloudSettingsModal';

type CapturedSettingsProps = ComponentProps<typeof SettingsModal>;

function latestSettingsProps(): CapturedSettingsProps {
  const props = mocks.settingsModal.mock.calls.at(-1)?.[0];
  if (!props) throw new Error('DesktopCloudSettingsModal did not render the shared SettingsModal.');
  return props as CapturedSettingsProps;
}

describe('DesktopCloudSettingsModal capability honesty', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listConnectors.mockResolvedValue({ connectors: [], available: [] });
    mocks.listCloudSkills.mockResolvedValue([]);
    mocks.createCustomConnector.mockResolvedValue({
      id: null,
      shortId: null,
      signInRequired: false,
    });
    mocks.openExternalUrl.mockResolvedValue(undefined);
  });

  it('keeps every signed-in Web settings surface reachable inside Desktop', () => {
    render(<DesktopCloudSettingsModal open={false} onClose={vi.fn()} initialTab="team" />);

    const props = latestSettingsProps();
    expect(props.activeSection).toBe('team');
    expect(props.sectionContent['team']).toBeTruthy();
    expect(props.navGroups?.flatMap((group) => group.items.map((item) => item.key))).toEqual(
      expect.arrayContaining([
        'team',
        'security',
        'notifications',
        'reflect',
        'time-focus',
        'plugins',
        'memory',
      ]),
    );
    for (const key of ['security', 'notifications', 'reflect', 'time-focus', 'plugins']) {
      expect(props.sectionContent[key]).toBeTruthy();
    }
  });

  it('renders content for every item in its own navigation', () => {
    render(<DesktopCloudSettingsModal open={false} onClose={vi.fn()} />);

    const props = latestSettingsProps();
    const builtInPanels = new Set(['connectors', 'skills', 'plugins']);
    const deadItems = (props.navGroups ?? [])
      .flatMap((group) => group.items)
      .filter((item) => !builtInPanels.has(item.key) && !props.sectionContent[item.key])
      .map((item) => item.key);

    expect(deadItems).toEqual([]);
  });

  it('hands the Referrals entry off to the web referrals page', async () => {
    const user = userEvent.setup();
    render(<DesktopCloudSettingsModal open={false} onClose={vi.fn()} />);

    const props = latestSettingsProps();
    const navKeys = (props.navGroups ?? []).flatMap((group) => group.items.map((item) => item.key));
    expect(navKeys).toContain('referrals');

    render(<>{props.sectionContent['referrals']}</>);
    await user.click(await screen.findByRole('button', { name: 'Open referrals' }));

    await waitFor(() =>
      expect(mocks.openExternalUrl).toHaveBeenCalledWith(
        new URL('/settings/referrals', WEB_APP_URL).toString(),
      ),
    );
  });

  it('can reach archived chats and shared links, the surfaces web links from Privacy', () => {
    render(<DesktopCloudSettingsModal open={false} onClose={vi.fn()} />);

    const props = latestSettingsProps();
    const navKeys = (props.navGroups ?? []).flatMap((group) => group.items.map((item) => item.key));

    expect(navKeys).toEqual(expect.arrayContaining(['archived', 'shared-links']));
    expect(props.sectionContent['archived']).toBeTruthy();
    expect(props.sectionContent['shared-links']).toBeTruthy();
  });

  it('advertises and forwards bearer-token support for custom Cloud connectors', async () => {
    render(<DesktopCloudSettingsModal open={false} onClose={vi.fn()} />);

    const adapter = latestSettingsProps().adapter as SettingsDataAdapter;
    expect(adapter.customConnectorAuthTokenSupported).toBe(true);

    await act(async () => {
      await adapter.addCustomConnector?.({
        name: 'Private MCP',
        url: 'https://mcp.example.com',
        authToken: 'secret-token',
      });
    });

    expect(mocks.createCustomConnector).toHaveBeenCalledWith({
      name: 'Private MCP',
      url: 'https://mcp.example.com',
      authToken: 'secret-token',
    });
  });

  it('loads only the active Cloud directory until the user opens another one', async () => {
    const { rerender } = render(
      <DesktopCloudSettingsModal open onClose={vi.fn()} initialTab="connectors" />,
    );

    await waitFor(() => expect(mocks.listConnectors).toHaveBeenCalledTimes(1));
    expect(mocks.listCloudSkills).not.toHaveBeenCalled();

    rerender(<DesktopCloudSettingsModal open onClose={vi.fn()} initialTab="skills" />);
    await waitFor(() => expect(mocks.listCloudSkills).toHaveBeenCalledTimes(1));
  });

  it('projects authenticated Cloud skill downloads into the shared Desktop directory', async () => {
    mocks.listCloudSkills.mockResolvedValue([
      {
        name: 'fixture-reviewed-skill',
        description: 'Reviewed fixture instructions.',
        source: 'bundled',
        lifecycle: 'included',
        downloadable: true,
      },
    ]);

    render(<DesktopCloudSettingsModal open onClose={vi.fn()} initialTab="skills" />);
    await waitFor(() => expect(mocks.listCloudSkills).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const adapter = latestSettingsProps().adapter as SettingsDataAdapter;
      expect(adapter.skills?.[0]?.downloadHref).toMatch(
        /\/api\/skills\/fixture-reviewed-skill\/download$/,
      );
    });
  });

  it('ignores a directory response that finishes after Settings closes', async () => {
    let resolveConnectors: ((value: { connectors: []; available: [] }) => void) | undefined;
    mocks.listConnectors.mockReturnValue(
      new Promise((resolve) => {
        resolveConnectors = resolve;
      }),
    );

    const { rerender } = render(
      <DesktopCloudSettingsModal open onClose={vi.fn()} initialTab="connectors" />,
    );
    await waitFor(() => expect(mocks.listConnectors).toHaveBeenCalledTimes(1));

    rerender(<DesktopCloudSettingsModal open={false} onClose={vi.fn()} initialTab="connectors" />);
    await act(async () => {
      resolveConnectors?.({ connectors: [], available: [] });
      await Promise.resolve();
    });

    const adapter = latestSettingsProps().adapter as SettingsDataAdapter;
    expect(adapter.connectors).toBeUndefined();
    expect(adapter.connectorsLoading).toBe(false);
  });
});
