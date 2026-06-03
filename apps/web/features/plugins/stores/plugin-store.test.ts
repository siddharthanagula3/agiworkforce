import { describe, expect, it } from 'vitest';
import { usePluginStore } from './plugin-store';
import type { Plugin } from '../types';

describe('plugin-store preview mode', () => {
  it('does not persist fake plugin installs while marketplace install is unavailable', () => {
    const plugin: Plugin = {
      id: 'preview-plugin',
      name: 'Preview Plugin',
      author: 'AGI Workforce',
      version: '0.1.0',
      description: 'Preview only',
      category: 'Developer',
      source: 'marketplace',
      downloadCount: 0,
      skills: [],
      connectors: [],
    };

    const store = usePluginStore.getState();
    store.installPlugin(plugin);

    expect(store.isInstalled(plugin.id)).toBe(false);
    expect(store.getInstalledPlugins()).toEqual([]);
  });
});
