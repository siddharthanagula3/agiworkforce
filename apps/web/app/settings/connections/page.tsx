'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatPrivacyModeLabel } from '@agiworkforce/types';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { OfficialConnectorLogo } from '@/features/connectors/components/OfficialConnectorLogo';
import { CONNECTORS as CONNECTOR_CATALOG } from '@/features/connectors/data/connectors';

/**
 * /settings/connections — account connector status for hosted cloud.
 * Local-mode and BYOK users can attach equivalent tools through MCP without
 * granting AGI-hosted cloud access.
 */
const SETTINGS_CONNECTOR_IDS = [
  'google-drive',
  'github',
  'slack',
  'gmail',
  'google-calendar',
  'google-sheets',
  'notion',
] as const;

const SETTINGS_CONNECTORS = SETTINGS_CONNECTOR_IDS.map((connectorId) =>
  CONNECTOR_CATALOG.find((connector) => connector.id === connectorId),
).filter((connector): connector is (typeof CONNECTOR_CATALOG)[number] => Boolean(connector));

/**
 * Formats a connection timestamp as a relative string ("3d ago", "2h ago", etc.).
 * Mirrors the same function in features/connectors/pages/ConnectorsPage.tsx.
 */
function formatRelativeTime(isoString: string | null | undefined): string {
  if (!isoString) return 'Never';
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const managedLabel = formatPrivacyModeLabel('managed');

type ConnectorConnection = {
  connectorId: string;
  connectedAt: string;
};

export default function ConnectionsSettingsPage() {
  const [connections, setConnections] = useState<ConnectorConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectedAtMap = useMemo(
    () =>
      Object.fromEntries(
        connections.map((connection) => [connection.connectorId, connection.connectedAt]),
      ) as Record<string, string | null>,
    [connections],
  );

  const loadConnections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/connectors', { credentials: 'include' });
      if (!response.ok) throw new Error('Could not load connectors');
      const data = (await response.json()) as {
        connectors?: Array<{ connectorId: string; connectedAt: string }>;
      };
      setConnections(data.connectors ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load connectors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  async function disconnect(connectorId: string) {
    setDisconnectingId(connectorId);
    setError(null);
    try {
      const headers = await addCsrfHeaders({});
      const response = await fetch(
        `/api/connectors?connectorId=${encodeURIComponent(connectorId)}`,
        {
          method: 'DELETE',
          headers,
          credentials: 'include',
        },
      );
      if (!response.ok) throw new Error('Could not disconnect connector');
      setConnections((current) =>
        current.filter((connection) => connection.connectorId !== connectorId),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect connector');
    } finally {
      setDisconnectingId(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <h1
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 4px',
          }}
        >
          Connections
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          External services the assistant can read on your behalf. Enabled providers connect from
          the connector directory; local-mode and BYOK installs use MCP connectors instead.
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-3)' }} role="status">
          {loading ? 'Loading connectors...' : error ? `Error: ${error}` : 'Connector state loaded'}
        </p>
      </div>

      <div
        role="status"
        style={{
          border: '1px dashed var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          padding: '14px 18px',
          fontSize: 13,
          color: 'var(--text-2)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: 'var(--settings-border)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            flexShrink: 0,
          }}
        >
          !
        </span>
        Connector access follows your {managedLabel} plan. Existing connections can be reviewed and
        disconnected here; unconnected providers open in the connector directory.
      </div>

      <section
        aria-label="Available connectors"
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        {SETTINGS_CONNECTORS.map((connector, idx) => {
          const connectedAt = connectedAtMap[connector.id] ?? null;
          const isConnected = connectedAt !== null;

          return (
            <div
              key={connector.id}
              style={{
                padding: '14px 18px',
                borderTop: idx === 0 ? 'none' : '1px solid var(--settings-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              {/* Icon + info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <OfficialConnectorLogo connector={connector} className="h-9 w-9 rounded-lg" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                    {connector.name}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    {connector.description}
                  </span>
                  {isConnected && connectedAt && (
                    <span style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                      Connected {formatRelativeTime(connectedAt)}
                    </span>
                  )}
                </div>
              </div>

              {/* Action button */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {isConnected ? (
                  <button
                    type="button"
                    disabled={disconnectingId === connector.id}
                    onClick={() => void disconnect(connector.id)}
                    aria-label={`Disconnect ${connector.name}`}
                    style={{
                      padding: '5px 12px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text-3)',
                      background: 'transparent',
                      border: '1px solid var(--settings-border)',
                      borderRadius: 'var(--radius-md)',
                      cursor: disconnectingId === connector.id ? 'default' : 'pointer',
                      opacity: disconnectingId === connector.id ? 0.7 : 1,
                    }}
                  >
                    {disconnectingId === connector.id ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                ) : (
                  <a
                    href="/connectors"
                    aria-label={`Manage ${connector.name} connector`}
                    style={{
                      padding: '5px 12px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text-3)',
                      background: 'transparent',
                      border: '1px solid var(--settings-border)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      textDecoration: 'none',
                    }}
                  >
                    Manage
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
