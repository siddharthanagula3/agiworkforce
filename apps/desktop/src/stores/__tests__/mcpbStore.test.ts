import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { McpBundle } from '../../types/mcp';

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock('../../lib/tauri-mock', () => tauri);

import { useMcpbStore } from '../mcpbStore';

const installedBundle: McpBundle = {
  id: 'mcp-example',
  name: 'Example tools',
  version: '1.0.0',
  description: 'Example MCP tools for tests.',
  author: 'Example publisher',
  category: 'development',
  npmPackage: '@example/mcp-server',
  tools: [{ name: 'example', description: 'Runs an example.', parameters: [] }],
  configTemplate: {
    command: 'npx',
    args: ['-y', '@example/mcp-server'],
    env: {},
    enabled: false,
  },
  requiredCredentials: [],
  verified: true,
  featured: false,
  tags: ['example'],
  installed: true,
  installedVersion: '1.0.0',
  updateAvailable: false,
};

describe('mcpbStore', () => {
  beforeEach(() => {
    tauri.invoke.mockReset();
    useMcpbStore.setState({
      bundles: [],
      installedBundles: [],
      featuredBundles: [],
      categories: [],
      selectedCategory: null,
      searchQuery: '',
      isLoading: false,
      isInstalling: false,
      installProgress: null,
      error: null,
    });
  });

  it('refreshes installed state and preserves a completed progress result', async () => {
    tauri.invoke.mockImplementation((command: string) => {
      switch (command) {
        case 'mcpb_install_bundle':
          return Promise.resolve('installed');
        case 'mcpb_fetch_registry':
        case 'mcpb_get_featured':
        case 'mcpb_get_installed_bundles':
          return Promise.resolve([installedBundle]);
        case 'mcpb_get_categories':
          return Promise.resolve(['development']);
        default:
          return Promise.reject(new Error(`Unexpected command: ${command}`));
      }
    });

    await useMcpbStore.getState().installBundle(installedBundle.id);

    const state = useMcpbStore.getState();
    expect(state.bundles).toEqual([installedBundle]);
    expect(state.installedBundles).toEqual([installedBundle]);
    expect(state.installProgress).toMatchObject({
      bundleId: installedBundle.id,
      status: 'completed',
      progress: 100,
    });
    expect(state.isInstalling).toBe(false);
  });

  it('keeps an actionable failed result when native installation rejects', async () => {
    tauri.invoke.mockRejectedValueOnce(new Error('npm install failed'));

    await useMcpbStore.getState().installBundle(installedBundle.id);

    expect(useMcpbStore.getState()).toMatchObject({
      isInstalling: false,
      error: 'npm install failed',
      installProgress: {
        bundleId: installedBundle.id,
        status: 'failed',
        progress: 0,
        error: 'npm install failed',
      },
    });
  });
});
