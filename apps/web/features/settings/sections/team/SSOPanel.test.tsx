import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: vi.fn(async () => 'csrf-token') }));

import { SSOPanel } from './SSOPanel';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const CONNECTION_ID = '22222222-2222-4222-8222-222222222222';

function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: CONNECTION_ID,
    organizationId: ORG_ID,
    providerType: 'saml',
    domain: 'example.com',
    displayName: 'Okta',
    metadataUrl: 'https://example.okta.com/metadata',
    oidcDiscoveryUrl: null,
    oidcClientId: null,
    isActive: false,
    status: 'awaiting_domain_verification',
    domainVerifiedAt: null,
    serviceProvider: { acsUrl: null, entityId: null, metadataUrl: null },
    domainVerification: {
      recordType: 'TXT',
      recordName: '_agiworkforce-sso.example.com',
      recordValue: 'agiworkforce-sso-verification=abc123',
    },
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SSOPanel entitlement', () => {
  it('renders nothing when the server refuses the request as unentitled', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: 'requires an active Enterprise plan', code: 'SUBSCRIPTION_REQUIRED' },
        403,
      ),
    );

    const { container } = render(<SSOPanel organizationId={ORG_ID} isOwner />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // No heading, no form, no upsell — an unentitled org is told nothing here.
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/Single sign-on/i)).toBeNull();
  });

  it('renders nothing when the request fails outright', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const { container } = render(<SSOPanel organizationId={ORG_ID} isOwner />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('asks the server about this specific organization', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ connections: [] }));

    render(<SSOPanel organizationId={ORG_ID} isOwner />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/admin/sso?orgId=${ORG_ID}`,
        expect.objectContaining({ credentials: 'same-origin' }),
      ),
    );
  });
});

describe('SSOPanel for an entitled organization', () => {
  it('shows the honest empty state and the create form to an owner', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ connections: [] }));

    render(<SSOPanel organizationId={ORG_ID} isOwner />);

    expect(await screen.findByText(/Single sign-on/i)).toBeVisible();
    expect(screen.getByText('No SSO connections yet.')).toBeVisible();
    expect(screen.getByLabelText('Email domain')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add connection' })).toBeVisible();
  });

  it('hides every mutating control from a non-owner admin', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ connections: [connection()] }));

    render(<SSOPanel organizationId={ORG_ID} isOwner={false} />);

    expect(await screen.findByText(/Single sign-on/i)).toBeVisible();
    expect(screen.getByText('Okta')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Add connection' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Verify domain' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('publishes the DNS challenge an admin must add, and says sign-in is not yet routed', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ connections: [connection()] }));

    render(<SSOPanel organizationId={ORG_ID} isOwner />);

    expect(await screen.findByText('_agiworkforce-sso.example.com')).toBeVisible();
    expect(screen.getByText('agiworkforce-sso-verification=abc123')).toBeVisible();
    expect(screen.getByText(/Domain not verified/)).toBeVisible();
    expect(screen.getByText(/Sign-in is not routed to this provider until you do/i)).toBeVisible();
  });

  it('offers verification, not activation, while the domain is unverified', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ connections: [connection()] }));

    render(<SSOPanel organizationId={ORG_ID} isOwner />);

    expect(await screen.findByRole('button', { name: 'Verify domain' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Activate' })).toBeNull();
  });

  it('offers activation once the domain is verified', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        connections: [
          connection({
            domainVerifiedAt: '2026-08-04T01:00:00.000Z',
            domainVerification: null,
            status: 'awaiting_provider_configuration',
          }),
        ],
      }),
    );

    render(<SSOPanel organizationId={ORG_ID} isOwner />);

    expect(await screen.findByRole('button', { name: 'Activate' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Verify domain' })).toBeNull();
  });

  it('shows the service provider values an IdP requires once provisioned', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        connections: [
          connection({
            isActive: true,
            status: 'active',
            domainVerifiedAt: '2026-08-04T01:00:00.000Z',
            domainVerification: null,
            serviceProvider: {
              acsUrl: 'https://accounts.example.com/v1/saml/acs/ec_1',
              entityId: 'https://accounts.example.com/saml/ec_1',
              metadataUrl: 'https://accounts.example.com/v1/saml/metadata/ec_1',
            },
          }),
        ],
      }),
    );

    render(<SSOPanel organizationId={ORG_ID} isOwner />);

    expect(await screen.findByText('https://accounts.example.com/v1/saml/acs/ec_1')).toBeVisible();
    expect(screen.getByText('https://accounts.example.com/saml/ec_1')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeVisible();
  });

  it('creates a SAML connection with a CSRF token and reloads the list', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ connections: [] }));

    render(<SSOPanel organizationId={ORG_ID} isOwner />);

    fireEvent.change(await screen.findByLabelText('Email domain'), {
      target: { value: 'example.com' },
    });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Okta' } });
    fireEvent.change(screen.getByLabelText('IdP metadata URL'), {
      target: { value: 'https://example.okta.com/metadata' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add connection' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/sso',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'x-csrf-token': 'csrf-token' }),
          body: JSON.stringify({
            organization_id: ORG_ID,
            provider_type: 'saml',
            domain: 'example.com',
            display_name: 'Okta',
            metadata_url: 'https://example.okta.com/metadata',
          }),
        }),
      ),
    );
  });

  it('collects OIDC fields and states that the secret is not stored here', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ connections: [] }));

    render(<SSOPanel organizationId={ORG_ID} isOwner />);

    fireEvent.change(await screen.findByLabelText('Protocol'), { target: { value: 'oidc' } });

    expect(screen.getByLabelText('OIDC discovery URL')).toBeVisible();
    expect(screen.getByLabelText('OIDC client ID')).toBeVisible();
    expect(screen.queryByLabelText('IdP metadata URL')).toBeNull();
    expect(screen.getByText(/never stored here/i)).toBeVisible();
  });

  it('surfaces the server’s refusal verbatim instead of a generic failure', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ connections: [] }))
      .mockResolvedValueOnce(
        jsonResponse(
          { error: 'domain is a public mailbox provider and cannot be claimed for enterprise SSO' },
          400,
        ),
      );

    render(<SSOPanel organizationId={ORG_ID} isOwner />);

    fireEvent.change(await screen.findByLabelText('Email domain'), {
      target: { value: 'gmail.com' },
    });
    fireEvent.change(screen.getByLabelText('IdP metadata URL'), {
      target: { value: 'https://example.okta.com/metadata' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add connection' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'domain is a public mailbox provider',
    );
  });

  it('triggers domain verification against the connection id', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ connections: [connection()] }));

    render(<SSOPanel organizationId={ORG_ID} isOwner />);

    fireEvent.click(await screen.findByRole('button', { name: 'Verify domain' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/sso/verify-domain',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ connectionId: CONNECTION_ID }),
        }),
      ),
    );
  });
});
