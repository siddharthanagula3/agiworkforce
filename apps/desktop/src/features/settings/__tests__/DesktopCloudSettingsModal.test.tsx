import { act, type ComponentProps } from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsDataAdapter, SettingsModal } from '@agiworkforce/ui';

const mocks = vi.hoisted(() => ({
  settingsModal: vi.fn((_props: unknown) => null),
  listConnectors: vi.fn(),
  connectConnector: vi.fn(),
  createCustomConnector: vi.fn(),
  deleteCustomConnector: vi.fn(),
  disconnectConnector: vi.fn(),
}));

vi.mock('@agiworkforce/ui', () => ({
  SettingsModal: mocks.settingsModal,
}));

vi.mock('../../../api/cloudConnectors', () => ({
  listConnectors: mocks.listConnectors,
  connectConnector: mocks.connectConnector,
  createCustomConnector: mocks.createCustomConnector,
  deleteCustomConnector: mocks.deleteCustomConnector,
  disconnectConnector: mocks.disconnectConnector,
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
    mocks.createCustomConnector.mockResolvedValue(undefined);
  });

  it('provides a truthful Web handoff for Team administration', () => {
    render(<DesktopCloudSettingsModal open={false} onClose={vi.fn()} initialTab="team" />);

    const props = latestSettingsProps();
    expect(props.activeKeys).toContain('team');
    expect(props.activeSection).toBe('team');
    expect(props.sectionContent['team']).toBeTruthy();
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
});
