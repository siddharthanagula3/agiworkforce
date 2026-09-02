'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useConfirmAction } from '@agiworkforce/ui';
import { getCsrfToken } from '@/lib/client/csrf';

type ConnectionStatus =
  | 'awaiting_domain_verification'
  | 'awaiting_provider_configuration'
  | 'ready_to_activate'
  | 'active';

interface Connection {
  id: string;
  organizationId: string;
  providerType: 'saml' | 'oidc';
  domain: string;
  displayName: string | null;
  metadataUrl: string | null;
  oidcDiscoveryUrl: string | null;
  oidcClientId: string | null;
  isActive: boolean;
  status: ConnectionStatus;
  domainVerifiedAt: string | null;
  serviceProvider: { acsUrl: string | null; entityId: string | null; metadataUrl: string | null };
  domainVerification: { recordType: 'TXT'; recordName: string; recordValue: string } | null;
  domainChallengeExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_COPY: Record<ConnectionStatus, { label: string; detail: string }> = {
  awaiting_domain_verification: {
    label: 'Domain not verified',
    detail:
      'Publish the DNS TXT record below, then verify. Sign-in is not routed to this provider until you do.',
  },
  awaiting_provider_configuration: {
    label: 'Domain verified',
    detail: 'Activate to register this connection with your identity provider.',
  },
  ready_to_activate: {
    label: 'Ready to activate',
    detail: 'The connection is registered but dormant. Activate it to start routing sign-in.',
  },
  active: {
    label: 'Active',
    detail: 'Users with an email address on this domain sign in through your identity provider.',
  },
};

const cardStyle = {
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elev)',
  overflow: 'hidden',
} as const;

const controlStyle = {
  width: '100%',
  minHeight: 38,
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-base)',
  color: 'var(--text-1)',
  fontSize: 13,
  padding: '8px 11px',
} as const;

const buttonStyle = {
  minHeight: 34,
  border: 0,
  borderRadius: 'var(--radius-md)',
  background: 'var(--chat-accent-primary, #c8892a)',
  color: 'var(--chat-accent-on-primary)',
  fontSize: 13,
  fontWeight: 600,
  padding: '7px 13px',
  cursor: 'pointer',
} as const;

const secondaryButtonStyle = {
  ...buttonStyle,
  background: 'transparent',
  border: '1px solid var(--settings-border)',
  color: 'var(--text-2)',
} as const;

const monoStyle = {
  fontFamily: 'var(--mono, ui-monospace, monospace)',
  fontSize: 12,
  wordBreak: 'break-all',
  color: 'var(--text-1)',
} as const;

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return typeof body.error === 'string' && body.error.length > 0 ? body.error : fallback;
  } catch {
    return fallback;
  }
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gap: 2, marginTop: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}</span>
      <code style={monoStyle}>{value}</code>
    </div>
  );
}

export function SSOPanel({
  organizationId,
  isOwner,
}: {
  organizationId: string;
  isOwner: boolean;
}) {
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [domain, setDomain] = useState('');
  const [providerType, setProviderType] = useState<'saml' | 'oidc'>('saml');
  const [displayName, setDisplayName] = useState('');
  const [metadataUrl, setMetadataUrl] = useState('');
  const [discoveryUrl, setDiscoveryUrl] = useState('');
  const [clientId, setClientId] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/sso?orgId=${encodeURIComponent(organizationId)}`, {
        credentials: 'same-origin',
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setConnections(null);
          setUnavailable(false);
          return;
        }
        setUnavailable(true);
        return;
      }
      const body = (await response.json()) as { connections: Connection[] };
      setConnections(body.connections);
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = useCallback(
    async (url: string, method: string, body?: unknown, fallback = 'Request failed') => {
      setBusy(true);
      setError(null);
      try {
        const csrfToken = await getCsrfToken();
        const response = await fetch(url, {
          method,
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (!response.ok) {
          setError(await readError(response, fallback));
          return false;
        }
        await load();
        return true;
      } catch {
        setError(fallback);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  if (connections === null) {
    if (!unavailable) {
      return null;
    }

    return (
      <section style={cardStyle} aria-labelledby="sso-panel-heading">
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--settings-border)' }}>
          <div
            id="sso-panel-heading"
            style={{ color: 'var(--text-2)', fontSize: 13, fontWeight: 600 }}
          >
            Single sign-on (SAML / OIDC)
          </div>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p role="alert" style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
            Single sign-on settings could not be loaded. This is a problem reaching the server, not
            a change to your plan — any existing connections keep working.
          </p>
          <button type="button" onClick={() => void load()} style={{ alignSelf: 'flex-start' }}>
            Retry
          </button>
        </div>
      </section>
    );
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const payload: Record<string, unknown> = {
      organization_id: organizationId,
      provider_type: providerType,
      domain: domain.trim(),
    };
    if (displayName.trim()) payload['display_name'] = displayName.trim();
    if (providerType === 'saml') {
      payload['metadata_url'] = metadataUrl.trim();
    } else {
      payload['oidc_discovery_url'] = discoveryUrl.trim();
      payload['oidc_client_id'] = clientId.trim();
    }

    const ok = await mutate(
      '/api/admin/sso',
      'POST',
      payload,
      'Could not create the SSO connection.',
    );
    if (ok) {
      setDomain('');
      setDisplayName('');
      setMetadataUrl('');
      setDiscoveryUrl('');
      setClientId('');
    }
  }

  return (
    <>
      {confirmDialog}
      <section style={cardStyle} aria-labelledby="sso-panel-heading">
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--settings-border)' }}>
          <div
            id="sso-panel-heading"
            style={{ color: 'var(--text-2)', fontSize: 13, fontWeight: 600 }}
          >
            Single sign-on (SAML / OIDC)
          </div>
          <div style={{ color: 'var(--text-3)', fontSize: 12, lineHeight: 1.5, marginTop: 3 }}>
            Route sign-in for an email domain you control to Okta, Microsoft Entra ID, Google
            Workspace, or any SAML 2.0 / OIDC provider. Domain ownership must be proven by DNS
            before a connection can go live.
          </div>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error ? (
            <p
              role="alert"
              style={{
                margin: 0,
                color: 'var(--settings-destructive-text)',
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              {error}
            </p>
          ) : null}

          {connections.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 13 }}>
              No SSO connections yet.
            </p>
          ) : null}

          {connections.map((connection) => {
            const copy = STATUS_COPY[connection.status];
            return (
              <article
                key={connection.id}
                style={{
                  border: '1px solid var(--settings-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: 14,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ color: 'var(--text-1)', fontSize: 14, fontWeight: 600 }}>
                      {connection.displayName ?? connection.domain}
                    </div>
                    <div style={{ color: 'var(--text-3)', fontSize: 12 }}>
                      {connection.providerType.toUpperCase()} · {connection.domain}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{copy.label}</span>
                </div>

                <p
                  style={{
                    margin: '8px 0 0',
                    color: 'var(--text-3)',
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  {copy.detail}
                </p>

                {connection.domainVerification ? (
                  <div style={{ marginTop: 10 }}>
                    <CopyRow label="Record type" value={connection.domainVerification.recordType} />
                    <CopyRow label="Record name" value={connection.domainVerification.recordName} />
                    <CopyRow
                      label="Record value"
                      value={connection.domainVerification.recordValue}
                    />
                    {connection.domainChallengeExpiresAt ? (
                      <p style={{ margin: '6px 0 0', color: 'var(--text-3)', fontSize: 12 }}>
                        This challenge expires{' '}
                        {new Date(connection.domainChallengeExpiresAt).toLocaleString()}. Reissue it
                        to get a fresh record.
                      </p>
                    ) : null}
                  </div>
                ) : !connection.domainVerifiedAt ? (
                  <p
                    role="status"
                    style={{ margin: '10px 0 0', color: 'var(--text-3)', fontSize: 12 }}
                  >
                    The domain verification challenge has expired. Reissue it to get a new DNS TXT
                    record, publish that record, then verify.
                  </p>
                ) : null}

                {connection.serviceProvider.acsUrl ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      Paste these into your identity provider:
                    </div>
                    <CopyRow label="ACS URL" value={connection.serviceProvider.acsUrl} />
                    {connection.serviceProvider.entityId ? (
                      <CopyRow label="SP entity ID" value={connection.serviceProvider.entityId} />
                    ) : null}
                    {connection.serviceProvider.metadataUrl ? (
                      <CopyRow
                        label="SP metadata URL"
                        value={connection.serviceProvider.metadataUrl}
                      />
                    ) : null}
                  </div>
                ) : null}

                {isOwner ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                    {!connection.domainVerifiedAt ? (
                      <>
                        <button
                          type="button"
                          disabled={busy || !connection.domainVerification}
                          style={buttonStyle}
                          onClick={() =>
                            void mutate(
                              '/api/admin/sso/verify-domain',
                              'POST',
                              { connectionId: connection.id },
                              'Domain verification failed.',
                            )
                          }
                        >
                          Verify domain
                        </button>
                        {/* Challenges expire, so the reissue endpoint has to be
                          reachable from here — otherwise a lapsed challenge is
                          a dead end for everyone who does not call the API by
                          hand. */}
                        <button
                          type="button"
                          disabled={busy}
                          style={secondaryButtonStyle}
                          onClick={() =>
                            void mutate(
                              '/api/admin/sso/verify-domain',
                              'PUT',
                              { connectionId: connection.id },
                              'Could not reissue the domain challenge.',
                            )
                          }
                        >
                          Reissue challenge
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        style={buttonStyle}
                        onClick={() =>
                          void mutate(
                            `/api/admin/sso/${connection.id}`,
                            'PATCH',
                            { is_active: !connection.isActive },
                            connection.isActive
                              ? 'Could not deactivate the connection.'
                              : 'Could not activate the connection.',
                          )
                        }
                      >
                        {connection.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      style={secondaryButtonStyle}
                      onClick={() =>
                        confirm({
                          title: 'Remove this SSO connection?',
                          description:
                            'Members who sign in through this connection lose access immediately. The connection and its configuration are deleted permanently — this cannot be undone.',
                          confirmLabel: 'Remove connection',
                          onConfirm: () =>
                            mutate(
                              `/api/admin/sso?id=${encodeURIComponent(connection.id)}&hard=true`,
                              'DELETE',
                              undefined,
                              'Could not remove the connection.',
                            ),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}

          {isOwner ? (
            <form
              onSubmit={handleCreate}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-3)' }}>
                Email domain
                <input
                  aria-label="Email domain"
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                  placeholder="example.com"
                  required
                  style={controlStyle}
                />
              </label>

              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-3)' }}>
                Protocol
                <select
                  aria-label="Protocol"
                  value={providerType}
                  onChange={(event) => setProviderType(event.target.value as 'saml' | 'oidc')}
                  style={controlStyle}
                >
                  <option value="saml">SAML 2.0</option>
                  <option value="oidc">OIDC</option>
                </select>
              </label>

              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-3)' }}>
                Display name
                <input
                  aria-label="Display name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Okta"
                  style={controlStyle}
                />
              </label>

              {providerType === 'saml' ? (
                <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-3)' }}>
                  IdP metadata URL
                  <input
                    aria-label="IdP metadata URL"
                    value={metadataUrl}
                    onChange={(event) => setMetadataUrl(event.target.value)}
                    placeholder="https://example.okta.com/app/.../sso/saml/metadata"
                    required
                    style={controlStyle}
                  />
                </label>
              ) : (
                <>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-3)' }}>
                    OIDC discovery URL
                    <input
                      aria-label="OIDC discovery URL"
                      value={discoveryUrl}
                      onChange={(event) => setDiscoveryUrl(event.target.value)}
                      placeholder="https://idp.example.com/.well-known/openid-configuration"
                      required
                      style={controlStyle}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-3)' }}>
                    OIDC client ID
                    <input
                      aria-label="OIDC client ID"
                      value={clientId}
                      onChange={(event) => setClientId(event.target.value)}
                      required
                      style={controlStyle}
                    />
                  </label>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                    The client secret is requested when you activate the connection. It is passed to
                    the identity provider and never stored here.
                  </p>
                </>
              )}

              <button
                type="submit"
                disabled={busy}
                style={{ ...buttonStyle, alignSelf: 'flex-start' }}
              >
                Add connection
              </button>
            </form>
          ) : null}
        </div>
      </section>
    </>
  );
}
