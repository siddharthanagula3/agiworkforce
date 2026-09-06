import { describe, expect, it } from 'vitest';

import {
  AUTHORIZATION_HEADER_NAME,
  bearerCredential,
  CustomConnectorCredentialError,
  encryptConnectorToken,
  openCustomConnectorCredential,
  sealCustomConnectorCredential,
} from '@/lib/custom-connector-crypto';

describe('custom connector credential envelope', () => {
  it('round-trips a named header through the encrypted store', () => {
    const sealed = sealCustomConnectorCredential({
      headerName: 'X-API-Key',
      headerValue: 'kb_live_example',
    });
    expect(sealed).not.toContain('kb_live_example');
    expect(openCustomConnectorCredential(sealed)).toEqual({
      headerName: 'X-API-Key',
      headerValue: 'kb_live_example',
    });
  });

  it('still opens a row written before the envelope existed as a bearer token', () => {
    const legacy = encryptConnectorToken('legacy-token', 'custom-connector-auth-header');
    expect(openCustomConnectorCredential(legacy)).toEqual(bearerCredential('legacy-token'));
    expect(bearerCredential('legacy-token')).toEqual({
      headerName: AUTHORIZATION_HEADER_NAME,
      headerValue: 'Bearer legacy-token',
    });
  });

  it('refuses a malformed envelope instead of sending a half-parsed header', () => {
    const broken = encryptConnectorToken(
      'agi-credential-v1:{"headerName":"X-API-Key"}',
      'custom-connector-auth-header',
    );
    expect(() => openCustomConnectorCredential(broken)).toThrow(CustomConnectorCredentialError);
    const unparsable = encryptConnectorToken(
      'agi-credential-v1:not json',
      'custom-connector-auth-header',
    );
    expect(() => openCustomConnectorCredential(unparsable)).toThrow(CustomConnectorCredentialError);
  });
});
