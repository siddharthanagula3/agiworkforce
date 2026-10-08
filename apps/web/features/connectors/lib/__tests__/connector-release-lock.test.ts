import { describe, expect, it, vi } from 'vitest';
import type { DirectoryAdapter, DirectoryDetail } from '@agiworkforce/ui';

import {
  PLUGIN_CONNECTORS_COMING_SOON_NOTE,
  lockConnectorDirectory,
} from '../connector-release-lock';

const DETAILS: Record<string, DirectoryDetail> = {
  gmail: {
    kind: 'connector',
    id: 'gmail',
    name: 'Gmail',
    summary: 'Mail',
    connectableMode: 'connect',
    related: [
      { id: 'drive', name: 'Google Drive', description: 'Files', connectableMode: 'connect' },
    ],
  },
  bundles: {
    kind: 'plugin',
    id: 'bundles',
    name: 'Bundles',
    description: 'Ships an MCP server',
    examplePrompts: [],
    components: {
      skills: [],
      commands: 0,
      agents: 0,
      hooks: false,
      mcpServers: [{ name: 'drive', transport: 'http' }],
      lspServers: [],
    },
  },
  plain: {
    kind: 'plugin',
    id: 'plain',
    name: 'Plain',
    description: 'Only skills',
    examplePrompts: [],
  },
  needs: {
    kind: 'plugin',
    id: 'needs',
    name: 'Needs',
    description: 'Needs a directory connector',
    examplePrompts: [],
    connectors: [{ id: 'gmail', name: 'Gmail', connected: false, status: 'not-added' }],
  },
};

function adapter(): DirectoryAdapter {
  return {
    sections: ['skills', 'connectors', 'plugins'],
    connectors: {
      installable: true,
      entries: [
        {
          id: 'gmail',
          name: 'Gmail',
          description: 'Mail',
          connectableMode: 'connect',
          statusLabel: 'Connectors are unavailable right now',
          installNotice: 'Grants read access',
        },
      ],
    },
    plugins: { installable: true, entries: [] },
    loadDetail: vi.fn(async (_section, id) => DETAILS[id] ?? null),
    install: vi.fn(async () => undefined),
    requestCredentials: vi.fn(),
    createEntry: vi.fn(),
  };
}

describe('lockConnectorDirectory', () => {
  it('locks the connectors section and every entry in it, without the stale unavailable copy', () => {
    const locked = lockConnectorDirectory(adapter());

    expect(locked.connectors?.locked).toEqual({
      label: 'Coming soon',
      message: 'Connecting Gmail, Google Drive, Calendar and other apps is coming soon.',
    });
    expect(locked.connectors?.entries).toEqual([
      { id: 'gmail', name: 'Gmail', description: 'Mail', connectableMode: 'coming-soon' },
    ]);
  });

  it('refuses every connector action but leaves the other sections working', async () => {
    const source = adapter();
    const locked = lockConnectorDirectory(source);

    await expect(locked.install?.('connectors', 'gmail')).resolves.toBe(
      'Connectors are coming soon.',
    );
    locked.requestCredentials?.('connectors', 'gmail');
    locked.createEntry?.('connectors');
    expect(source.install).not.toHaveBeenCalled();
    expect(source.requestCredentials).not.toHaveBeenCalled();
    expect(source.createEntry).not.toHaveBeenCalled();

    await locked.install?.('plugins', 'bundles');
    locked.createEntry?.('skills');
    expect(source.install).toHaveBeenCalledWith('plugins', 'bundles');
    expect(source.createEntry).toHaveBeenCalledWith('skills');
  });

  it('locks a connector detail and the related connectors it suggests', async () => {
    const detail = await lockConnectorDirectory(adapter()).loadDetail?.('connectors', 'gmail');

    expect(detail).toMatchObject({
      kind: 'connector',
      connectableMode: 'coming-soon',
      setupNotice: 'Connecting Gmail, Google Drive, Calendar and other apps is coming soon.',
      related: [{ id: 'drive', connectableMode: 'coming-soon' }],
    });
  });

  it('notes on a plugin that its bundled servers will not be added, and only then', async () => {
    const locked = lockConnectorDirectory(adapter());

    await expect(locked.loadDetail?.('plugins', 'bundles')).resolves.toMatchObject({
      connectorsNote: PLUGIN_CONNECTORS_COMING_SOON_NOTE,
    });
    await expect(locked.loadDetail?.('plugins', 'plain')).resolves.not.toHaveProperty(
      'connectorsNote',
    );
  });

  it('keeps one detail loader across re-wraps so an open detail does not reload forever', () => {
    const source = adapter();
    const first = lockConnectorDirectory(source).loadDetail;
    const second = lockConnectorDirectory({ ...source, plugins: { entries: [] } }).loadDetail;
    expect(second).toBe(first);
    expect(lockConnectorDirectory({ ...source, loadDetail: vi.fn() }).loadDetail).not.toBe(first);
  });

  it('locks every connector a plugin lists, and leaves a plugin with none untouched', async () => {
    const locked = lockConnectorDirectory(adapter());
    const lock = {
      label: 'Coming soon',
      message: 'Connecting Gmail, Google Drive, Calendar and other apps is coming soon.',
    };

    await expect(locked.loadDetail?.('plugins', 'needs')).resolves.toMatchObject({
      connectorsLocked: lock,
    });
    await expect(locked.loadDetail?.('plugins', 'needs')).resolves.not.toHaveProperty(
      'connectorsNote',
    );
    await expect(locked.loadDetail?.('plugins', 'bundles')).resolves.toMatchObject({
      connectorsLocked: lock,
    });
    await expect(locked.loadDetail?.('plugins', 'plain')).resolves.not.toHaveProperty(
      'connectorsLocked',
    );
  });
});
