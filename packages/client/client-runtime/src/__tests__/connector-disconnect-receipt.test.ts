import { describe, expect, it, vi } from 'vitest';

import {
  ConnectorResponseError,
  connectorEndpoints,
  createConnectorRuntime,
  type ConnectorLocalBridge,
} from '../index';

const ENDPOINTS = connectorEndpoints({
  connectors: '/api/connectors',
  oauthStart: '/api/connectors/oauth/start',
});

const VENDOR_NOTICE =
  'Disconnected here, but Notion access may remain until you remove it in Notion.';

function runtimeAnswering(body: unknown, local?: ConnectorLocalBridge) {
  const deleted: string[] = [];
  const runtime = createConnectorRuntime({
    surface: 'mobile',
    endpoints: ENDPOINTS,
    ...(local ? { local } : {}),
    http: {
      async get() {
        return {};
      },
      async post() {
        return {};
      },
      async put() {
        return {};
      },
      async delete(path) {
        deleted.push(path);
        return body;
      },
    },
  });
  return { runtime, deleted };
}

describe('connector disconnect receipt', () => {
  it('returns the provider notice the server sent with a confirmed disconnect', async () => {
    const { runtime, deleted } = runtimeAnswering({ success: true, vendorNotice: VENDOR_NOTICE });

    await expect(runtime.disconnect('notion')).resolves.toEqual({ vendorNotice: VENDOR_NOTICE });
    expect(deleted).toEqual(['/api/connectors?connectorId=notion']);
  });

  it('returns no notice when the provider confirmed the revocation', async () => {
    const { runtime } = runtimeAnswering({ success: true });

    await expect(runtime.disconnect('notion')).resolves.toEqual({ vendorNotice: null });
  });

  it.each([[{ success: false }], [{}], [null], [{ success: 'true' }]])(
    'treats %j as an unconfirmed disconnect',
    async (body) => {
      const { runtime } = runtimeAnswering(body);

      await expect(runtime.disconnect('notion')).rejects.toBeInstanceOf(ConnectorResponseError);
    },
  );

  it('carries the notice from a custom connector removal', async () => {
    const { runtime, deleted } = runtimeAnswering({ success: true, vendorNotice: VENDOR_NOTICE });

    await expect(runtime.deleteCustomConnector('row-1')).resolves.toEqual({
      vendorNotice: VENDOR_NOTICE,
    });
    expect(deleted).toEqual(['/api/connectors/custom?id=row-1']);
  });

  it('a local host disconnect has no provider notice and sends nothing to the server', async () => {
    const local: ConnectorLocalBridge = {
      list: async () => [],
      connect: async () => {},
      disconnect: vi.fn(async () => {}),
    };
    const { runtime, deleted } = runtimeAnswering({ success: false }, local);

    await expect(runtime.disconnect('notion')).resolves.toEqual({ vendorNotice: null });
    expect(local.disconnect).toHaveBeenCalledWith('notion');
    expect(deleted).toEqual([]);
  });
});
