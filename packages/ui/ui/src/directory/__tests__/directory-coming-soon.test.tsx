import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConnectorDetailView } from '../ConnectorDetailView';
import { DirectoryPanel } from '../DirectoryPanel';
import { PluginDetailView } from '../PluginDetailView';
import type {
  DirectoryAdapter,
  DirectoryConnectorDetail,
  DirectoryPluginDetail,
  DirectorySection,
} from '../types';

afterEach(cleanup);

const LOCK = { label: 'Coming soon', message: 'Connecting Gmail and other apps is coming soon.' };

function lockedAdapter(patch: Partial<DirectoryAdapter> = {}): DirectoryAdapter {
  return {
    sections: ['connectors'],
    connectors: {
      installable: true,
      createLabel: 'Add custom connector',
      locked: LOCK,
      entries: [
        {
          id: 'gmail',
          name: 'Gmail',
          description: 'Mail',
          popular: true,
          connectableMode: 'coming-soon',
        },
        { id: 'notion', name: 'Notion', description: 'Docs', connectableMode: 'coming-soon' },
      ],
      sortOptions: ['name'],
    },
    install: vi.fn(),
    createEntry: vi.fn(),
    loadDetail: vi.fn(async () => null),
    ...patch,
  };
}

function connectorDetail(patch: Partial<DirectoryConnectorDetail> = {}): DirectoryConnectorDetail {
  return {
    kind: 'connector',
    id: 'gmail',
    name: 'Gmail',
    summary: 'Read and send mail',
    connected: false,
    connectableMode: 'coming-soon',
    setupNotice: 'Connecting Gmail and other apps is coming soon.',
    ...patch,
  };
}

describe('DirectoryPanel with a locked section', () => {
  it('says the section is coming soon above the catalog, which stays visible', () => {
    render(<DirectoryPanel section="connectors" adapter={lockedAdapter()} />);

    const notice = screen.getByTestId('directory-locked-notice');
    expect(within(notice).getByText('Coming soon')).toBeTruthy();
    expect(within(notice).getByText(LOCK.message)).toBeTruthy();
    expect(screen.getByText('Gmail')).toBeTruthy();
    expect(screen.getByText('Notion')).toBeTruthy();
  });

  it('shows every connect control as a disabled lock that names what is coming', () => {
    const adapter = lockedAdapter();
    render(<DirectoryPanel section="connectors" adapter={adapter} />);

    const gmail = screen.getByRole('button', { name: 'Gmail, Coming soon' });
    expect((gmail as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(gmail);
    expect(adapter.install).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Connect / })).toBeNull();
  });

  it('keeps the create action visible but disabled and described by the notice', () => {
    const adapter = lockedAdapter();
    render(<DirectoryPanel section="connectors" adapter={adapter} />);

    const create = screen.getByRole('button', { name: 'Add custom connector' });
    expect((create as HTMLButtonElement).disabled).toBe(true);
    expect(create.getAttribute('aria-describedby')).toBe(
      screen.getByTestId('directory-locked-notice').id,
    );
    fireEvent.click(create);
    expect(adapter.createEntry).not.toHaveBeenCalled();
  });

  it('renders no notice and live controls for a section that is not locked', () => {
    const adapter = lockedAdapter();
    const open: DirectorySection = {
      ...adapter.connectors!,
      entries: adapter.connectors!.entries.map((entry) => ({
        ...entry,
        connectableMode: 'connect',
      })),
    };
    delete open.locked;
    render(<DirectoryPanel section="connectors" adapter={{ ...adapter, connectors: open }} />);

    expect(screen.queryByTestId('directory-locked-notice')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Connect Gmail' }));
    expect(adapter.install).toHaveBeenCalledWith('connectors', 'gmail');
  });
});

describe('ConnectorDetailView coming soon', () => {
  it('shows a lock and Coming soon in place of Connect, with the reason', () => {
    const onConnect = vi.fn();
    render(
      <ConnectorDetailView detail={connectorDetail()} onBack={vi.fn()} onConnect={onConnect} />,
    );

    expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
    expect(screen.getAllByText('Coming soon').length).toBeGreaterThan(0);
    expect(screen.getByTestId('connector-coming-soon-notice').textContent).toContain(
      'Connecting Gmail and other apps is coming soon.',
    );
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('does not offer to reconnect a connector whose grant lapsed', () => {
    const onConnect = vi.fn();
    render(
      <ConnectorDetailView
        detail={connectorDetail({ connected: true, needsReauthorization: true })}
        onBack={vi.fn()}
        onConnect={onConnect}
        onDisconnect={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy();
  });
});

describe('PluginDetailView bundled connectors', () => {
  const plugin: DirectoryPluginDetail = {
    kind: 'plugin',
    id: 'docs-helper',
    name: 'Docs helper',
    description: 'Works with your documents',
    examplePrompts: [],
    components: {
      skills: [],
      commands: 0,
      agents: 0,
      hooks: false,
      mcpServers: [{ name: 'drive', transport: 'http' }],
      lspServers: [],
    },
  };

  it('says the servers it bundles will not be added while connectors are coming soon', () => {
    render(
      <PluginDetailView
        detail={{ ...plugin, connectorsNote: 'Connectors are coming soon.' }}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId('plugin-connectors-note').textContent).toBe(
      'Connectors are coming soon.',
    );
  });

  it('adds no note when the adapter has none to give', () => {
    render(<PluginDetailView detail={plugin} onBack={vi.fn()} />);

    expect(screen.queryByTestId('plugin-connectors-note')).toBeNull();
  });
});
