import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn(async () => 'csrf-token') }));

import { SSOPanel } from './SSOPanel';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const fetchMock = vi.fn();

/**
 * CRIT-011: a backend failure must never be presented as "your organization
 * does not have SSO". Hiding the panel is reserved for the entitlement answer;
 * anything else has to say the server could not be reached.
 */
describe('SSOPanel when the connection list cannot be read', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([401, 403])('stays hidden on %i, which really does mean no SSO', async (status) => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'nope' }, status));

    const { container } = render(<SSOPanel organizationId={ORG_ID} isOwner />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it.each([500, 503])('reports %i as a server problem rather than hiding SSO', async (status) => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'boom' }, status));

    render(<SSOPanel organizationId={ORG_ID} isOwner />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not be loaded/i);
    expect(alert).toHaveTextContent(/not a change to your plan/i);
    // The heading stays, so the admin can see SSO still exists as a feature.
    expect(screen.getByText('Single sign-on (SAML / OIDC)')).toBeVisible();
  });

  it('reports a network failure the same way', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    render(<SSOPanel organizationId={ORG_ID} isOwner />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/i);
  });

  it('recovers to the real list when a retry succeeds', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 503));

    render(<SSOPanel organizationId={ORG_ID} isOwner />);

    const retry = await screen.findByRole('button', { name: 'Retry' });

    fetchMock.mockResolvedValueOnce(jsonResponse({ connections: [] }));
    retry.click();

    expect(await screen.findByText('No SSO connections yet.')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
