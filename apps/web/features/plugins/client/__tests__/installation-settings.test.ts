import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchPluginSettings,
  setPluginInstallationEnabled,
  updatePluginSettings,
  PLUGIN_NOT_INSTALLED_COPY,
  PluginSettingsError,
} from '../installation-settings';
import { PLUGIN_TARGET_BUILTIN, PLUGIN_TARGET_MARKETPLACE } from '../../routes';

const BUILTIN = { kind: PLUGIN_TARGET_BUILTIN, pluginId: 'research-pack' } as const;
const MARKETPLACE = {
  kind: PLUGIN_TARGET_MARKETPLACE,
  installationId: '22222222-2222-4222-8222-222222222222',
} as const;

const SETTINGS = {
  pluginId: 'research-pack',
  enabledSkills: ['literature-review'],
  examplePrompts: [],
  connectors: [],
  agents: [],
};

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const spy = vi.fn(async (url: string, init?: RequestInit) => handler(url, init));
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('plugin settings transport', () => {
  it('reads a built-in pack from the plugin settings route', async () => {
    const spy = stubFetch(() => Response.json({ settings: SETTINGS }));
    await expect(fetchPluginSettings(BUILTIN)).resolves.toEqual(SETTINGS);
    expect(spy.mock.calls[0]?.[0]).toBe('/api/plugins/research-pack/settings');
  });

  it('reads a marketplace install from the installation settings route', async () => {
    const spy = stubFetch(() => Response.json({ settings: SETTINGS }));
    await fetchPluginSettings(MARKETPLACE);
    expect(spy.mock.calls[0]?.[0]).toBe(
      `/api/plugins/marketplace-installations/${MARKETPLACE.installationId}/settings`,
    );
  });

  it('says the plugin is not installed on a 404 rather than a generic failure', async () => {
    stubFetch(() => Response.json({ error: {} }, { status: 404 }));
    await expect(fetchPluginSettings(BUILTIN)).rejects.toMatchObject({
      status: 404,
      message: PLUGIN_NOT_INSTALLED_COPY,
    });
  });

  it('repeats the deployment sentence when installs are switched off', async () => {
    stubFetch(() =>
      Response.json(
        { error: { code: 'PLUGIN_INSTALLS_DISABLED', message: 'Plugin installs are not enabled' } },
        { status: 503 },
      ),
    );
    await expect(fetchPluginSettings(MARKETPLACE)).rejects.toThrow(
      'Plugin installs are not enabled',
    );
  });

  it('sends the patch and the csrf header, and returns the stored settings', async () => {
    const spy = stubFetch(() => Response.json({ settings: { ...SETTINGS, enabledSkills: [] } }));
    const result = await updatePluginSettings(BUILTIN, { enabledSkills: [] }, 'token-1');
    expect(result.enabledSkills).toEqual([]);
    const init = spy.mock.calls[0]?.[1];
    expect(init?.method).toBe('PATCH');
    expect((init?.headers as Record<string, string>)['x-csrf-token']).toBe('token-1');
    expect(init?.body).toBe(JSON.stringify({ enabledSkills: [] }));
  });

  it('patches the installation itself when enabling, and trusts the stored value', async () => {
    const spy = stubFetch(() => Response.json({ installation: { enabled: false } }));
    await expect(setPluginInstallationEnabled(BUILTIN, false, 'token-1')).resolves.toBe(false);
    expect(spy.mock.calls[0]?.[0]).toBe('/api/plugins/installations/research-pack');
  });

  it('reports a failed enable rather than resolving as if it worked', async () => {
    stubFetch(() => Response.json({ error: {} }, { status: 500 }));
    await expect(setPluginInstallationEnabled(MARKETPLACE, true, 'token-1')).rejects.toBeInstanceOf(
      PluginSettingsError,
    );
  });
});
