import { act, type ComponentProps } from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsDataAdapter, SettingsModal } from '@agiworkforce/ui';

const mocks = vi.hoisted(() => ({
  settingsModal: vi.fn((_props: unknown) => null),
  listConnectors: vi.fn(),
  connectConnector: vi.fn(),
  createCustomConnector: vi.fn(),
  deleteCustomConnector: vi.fn(),
  disconnectConnector: vi.fn(),
  listCloudSkills: vi.fn(),
}));

// The real nav, not a hand-listed stand-in. This modal builds its nav BY
// MAPPING OVER SETTINGS_NAV_GROUPS_WEB, so a stub that omits an entry hides
// exactly the bug worth catching: 'safety' shipped in the real nav with no
// section content behind it, and the shared modal rendered its developer
// fallback ("No content for section ...") to the user.
vi.mock('@agiworkforce/ui', async () => {
  const actual = await vi.importActual<typeof import('@agiworkforce/ui')>('@agiworkforce/ui');
  return {
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
}));

vi.mock('../../../api/cloudSkills', () => ({
  listCloudSkills: mocks.listCloudSkills,
}));

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
    mocks.createCustomConnector.mockResolvedValue(undefined);
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

  /**
   * The guard the previous test could not provide: every item the nav renders
   * must resolve to something. Connectors, skills and plugins are the shared
   * modal's own built-in panels and legitimately have no entry here.
   */
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

  it('can reach archived chats and shared links, the surfaces web links from Privacy', () => {
    render(<DesktopCloudSettingsModal open={false} onClose={vi.fn()} />);

    const props = latestSettingsProps();
    const navKeys = (props.navGroups ?? []).flatMap((group) => group.items.map((item) => item.key));

    // Desktop can already publish a share; without this it could never revoke one.
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
