'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useConfirmAction } from '@agiworkforce/ui';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';

export interface LinkedDevice {
  id: string;
  kind: 'desktop' | 'mobile';
  name: string | null;
  platform: string | null;
  version: string | null;
  lastSeenAt: string | null;
  registeredAt: string | null;
  hasLiveCredential: boolean | null;
}

const PLATFORM_LABELS: Record<string, string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
  ios: 'iOS',
  android: 'Android',
};

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function describe(device: LinkedDevice): string {
  const platform = device.platform ? (PLATFORM_LABELS[device.platform] ?? device.platform) : null;
  const fallback = device.kind === 'desktop' ? 'Desktop app' : 'Mobile app';
  return device.name?.trim() || platform || fallback;
}

function readApiError(data: unknown, fallback: string): string {
  if (data === null || typeof data !== 'object' || !('error' in data)) return fallback;
  const error = (data as { error?: unknown }).error;
  if (typeof error === 'string' && error.trim()) return error;
  if (error !== null && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

const cell = { padding: '12px 16px', color: 'var(--text-3)', whiteSpace: 'nowrap' } as const;

export function LinkedDevicesPanel() {
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [devices, setDevices] = useState<LinkedDevice[]>([]);
  const [credentialStateKnown, setCredentialStateKnown] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch('/api/settings/devices', { credentials: 'same-origin' });
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readApiError(data, 'Unable to load linked devices.'));
      const payload = data as { devices?: LinkedDevice[]; credentialStateKnown?: boolean };
      setDevices(Array.isArray(payload.devices) ? payload.devices : []);
      setCredentialStateKnown(payload.credentialStateKnown !== false);
    } catch (error) {
      setLoadError(toUserMessage(error, 'Unable to load linked devices.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUnlink(device: LinkedDevice) {
    setActionError(null);
    setUnlinkingId(device.id);
    try {
      const headers = await addCsrfHeaders();
      const response = await fetch(`/api/settings/devices/${encodeURIComponent(device.id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers,
      });
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readApiError(data, 'Unable to unlink this device.'));
      setDevices((current) => current.filter((row) => row.id !== device.id));
    } catch (error) {
      setActionError(toUserMessage(error, 'Unable to unlink this device.'));
    } finally {
      setUnlinkingId(null);
    }
  }

  return (
    <>
      {confirmDialog}
      <section
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--settings-border)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-2)',
          }}
        >
          Linked devices
        </div>

        {loading ? (
          <div role="status" style={{ padding: 20, fontSize: 13, color: 'var(--text-3)' }}>
            Loading linked devices…
          </div>
        ) : loadError ? (
          <div style={{ padding: 20 }}>
            <p
              role="alert"
              style={{
                margin: '0 0 12px',
                fontSize: 13,
                color: 'var(--settings-destructive-text)',
              }}
            >
              {loadError}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 11px',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text-1)',
                background: 'transparent',
                border: '1px solid var(--settings-border)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={13} aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : devices.length === 0 ? (
          <p style={{ padding: 20, margin: 0, fontSize: 13, color: 'var(--text-3)' }}>
            No desktop or mobile app is linked to this account.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <caption className="sr-only">
                Desktop and mobile apps linked to your account, and whether each still holds a
                credential
              </caption>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-3)', fontSize: 11 }}>
                  <th scope="col" style={{ padding: '10px 16px', fontWeight: 500 }}>
                    Device
                  </th>
                  <th scope="col" style={{ padding: '10px 16px', fontWeight: 500 }}>
                    Signed in
                  </th>
                  <th scope="col" style={{ padding: '10px 16px', fontWeight: 500 }}>
                    Last seen
                  </th>
                  <th scope="col" style={{ padding: '10px 16px', fontWeight: 500 }}>
                    Linked
                  </th>
                  <th
                    scope="col"
                    style={{ padding: '10px 16px', fontWeight: 500, textAlign: 'right' }}
                  >
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={device.id} style={{ borderTop: '1px solid var(--settings-border)' }}>
                    <td style={{ ...cell, color: 'var(--text-1)' }}>
                      {describe(device)}
                      {device.version ? (
                        <span style={{ color: 'var(--text-3)' }}> · {device.version}</span>
                      ) : null}
                    </td>
                    <td style={cell}>
                      {device.hasLiveCredential === null
                        ? 'Unknown'
                        : device.hasLiveCredential
                          ? 'Yes'
                          : 'No'}
                    </td>
                    <td style={cell}>{formatDateTime(device.lastSeenAt)}</td>
                    <td style={cell}>{formatDateTime(device.registeredAt)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() =>
                          confirm({
                            title: `Unlink ${describe(device)}?`,
                            description:
                              'That device is signed out and its stored credentials are revoked. It has to be linked again from the device itself to regain access.',
                            confirmLabel: 'Unlink device',
                            onConfirm: () => handleUnlink(device),
                          })
                        }
                        disabled={unlinkingId !== null}
                        aria-label={`Unlink ${describe(device)}`}
                        style={{
                          padding: '6px 10px',
                          fontSize: 12,
                          fontWeight: 500,
                          color: 'var(--settings-destructive-text)',
                          background: 'transparent',
                          border: '1px solid var(--settings-border)',
                          borderRadius: 'var(--radius-md)',
                          cursor: unlinkingId !== null ? 'default' : 'pointer',
                          opacity: unlinkingId !== null && unlinkingId !== device.id ? 0.5 : 1,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {unlinkingId === device.id ? 'Unlinking…' : 'Unlink'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {actionError ? (
          <p
            role="alert"
            style={{
              padding: '0 20px 12px',
              margin: 0,
              fontSize: 12,
              color: 'var(--settings-destructive-text)',
            }}
          >
            {actionError}
          </p>
        ) : null}

        <p style={{ padding: '12px 20px 16px', margin: 0, fontSize: 11, color: 'var(--text-3)' }}>
          {credentialStateKnown ? (
            <>
              Unlinking revokes the device&rsquo;s stored credential and removes it from this list.
              The app signs out the next time it reaches the server.
            </>
          ) : (
            <>
              Sign-in state cannot be read on this deployment, so unlinking removes the device from
              this list without revoking its stored credential. Use &ldquo;Log out of all
              devices&rdquo; below to end every session.
            </>
          )}
        </p>
      </section>
    </>
  );
}
