import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ host: null as unknown, toast: vi.fn() }));

vi.mock('@agiworkforce/local-runtime-contract', () => ({
  getHostBridge: () => mocks.host,
}));
vi.mock('sonner', () => ({ toast: { info: mocks.toast } }));

import {
  CONNECTOR_AUTHORIZATION_IN_BROWSER,
  openConnectorAuthorization,
} from './open-connector-authorization';

describe('openConnectorAuthorization', () => {
  afterEach(() => {
    mocks.host = null;
    mocks.toast.mockReset();
  });

  it('opens the sign-in in the system browser from the desktop and reads the list on return', () => {
    const openExternal = vi.fn(async () => undefined);
    mocks.host = { shell: 'electron', openExternal };
    const onReturn = vi.fn();

    openConnectorAuthorization('/api/connectors/oauth/start?connectorId=slack', onReturn);

    expect(openExternal).toHaveBeenCalledWith(
      `${window.location.origin}/api/connectors/oauth/start?connectorId=slack`,
    );
    expect(mocks.toast).toHaveBeenCalledWith(CONNECTOR_AUTHORIZATION_IN_BROWSER);
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));
    expect(onReturn).toHaveBeenCalledTimes(1);
  });
});
