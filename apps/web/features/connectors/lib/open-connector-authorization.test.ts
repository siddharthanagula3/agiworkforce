import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  host: null as unknown,
  toast: vi.fn(),
  askConnectorConsent: vi.fn(async () => true),
}));

vi.mock('@agiworkforce/local-runtime-contract', () => ({
  getHostBridge: () => mocks.host,
}));
vi.mock('sonner', () => ({ toast: { info: mocks.toast } }));
vi.mock('../components/ConnectorConsentDialog', () => ({
  askConnectorConsent: mocks.askConnectorConsent,
}));

import {
  CONNECTOR_AUTHORIZATION_IN_BROWSER,
  openConnectorAuthorization,
  requestConnectorConsent,
} from './open-connector-authorization';

describe('requestConnectorConsent', () => {
  afterEach(() => {
    mocks.askConnectorConsent.mockReset();
  });

  it('returns a grant only when the user allows the named connector', async () => {
    mocks.askConnectorConsent.mockResolvedValueOnce(true);
    await expect(requestConnectorConsent({ id: 'slack', name: 'Slack' })).resolves.toEqual({
      connectorId: 'slack',
    });
    expect(mocks.askConnectorConsent).toHaveBeenCalledWith({ id: 'slack', name: 'Slack' });
  });

  it('returns no grant when the user denies', async () => {
    mocks.askConnectorConsent.mockResolvedValueOnce(false);
    await expect(requestConnectorConsent({ id: 'slack', name: 'Slack' })).resolves.toBeNull();
  });
});

describe('openConnectorAuthorization', () => {
  afterEach(() => {
    mocks.host = null;
    mocks.toast.mockReset();
  });

  it('opens the sign-in in the system browser from the desktop and reads the list on return', async () => {
    const openExternal = vi.fn(async () => undefined);
    mocks.host = { shell: 'electron', openExternal };
    const onReturn = vi.fn();
    mocks.askConnectorConsent.mockResolvedValueOnce(true);
    const grant = await requestConnectorConsent({ id: 'slack', name: 'Slack' });
    if (!grant) throw new Error('expected a consent grant');

    openConnectorAuthorization(grant, '/api/connectors/oauth/start?connectorId=slack', onReturn);

    expect(openExternal).toHaveBeenCalledWith(
      `${window.location.origin}/api/connectors/oauth/start?connectorId=slack`,
    );
    expect(mocks.toast).toHaveBeenCalledWith(CONNECTOR_AUTHORIZATION_IN_BROWSER);
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));
    expect(onReturn).toHaveBeenCalledTimes(1);
  });
});
