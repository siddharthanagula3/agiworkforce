
import { describe, it, expect } from 'vitest';

import { getConnectorOAuthNotice } from '../connector-oauth-notice';

describe('getConnectorOAuthNotice', () => {
  it('returns null when there is no status at all', () => {
    expect(getConnectorOAuthNotice(null, null)).toBeNull();
    expect(getConnectorOAuthNotice(undefined, undefined)).toBeNull();
    expect(getConnectorOAuthNotice('', 'linear')).toBeNull();
  });

  it('reports a completed authorization as a success that should refresh the list', () => {
    const notice = getConnectorOAuthNotice('connected', 'linear', 'Linear');
    expect(notice).toEqual({ kind: 'success', message: 'Linear connected.', connected: true });
  });

  it.each([
    ['denied', 'Authorization for Linear was canceled.'],
    ['failed', 'Linear authorization failed. Please try again.'],
    [
      'invalid_state',
      'The Linear authorization failed a security check. Start the connection again.',
    ],
    ['unavailable', 'Connector authorization is not available for Linear in this deployment.'],
  ])('reports %s as an error', (status, message) => {
    const notice = getConnectorOAuthNotice(status, 'linear', 'Linear');
    expect(notice).toEqual({ kind: 'error', message, connected: false });
  });

  it('falls back to the connector id when the catalog has no display name', () => {
    expect(getConnectorOAuthNotice('connected', 'linear')?.message).toBe('linear connected.');
  });

  it('handles a failure the broker could not attribute to a connector', () => {
    const notice = getConnectorOAuthNotice('invalid_state', null);
    expect(notice?.kind).toBe('error');
    expect(notice?.message).toContain('This connector');
  });

  it('ignores the directory status filter values when no connector is named', () => {
    expect(getConnectorOAuthNotice('connected', null)).toBeNull();
    expect(getConnectorOAuthNotice('ready', null)).toBeNull();
    expect(getConnectorOAuthNotice('request_access', null)).toBeNull();
  });

  it('ignores an unknown status that names no connector', () => {
    expect(getConnectorOAuthNotice('something_else', null)).toBeNull();
  });

  it('still reports an unknown status that names a connector', () => {
    const notice = getConnectorOAuthNotice('something_else', 'linear', 'Linear');
    expect(notice).toEqual({
      kind: 'error',
      message: 'Could not complete the Linear authorization. Please try again.',
      connected: false,
    });
  });
});
