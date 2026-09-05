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
  if (!value) return ', ';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return ', ';
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

function describeState(device: LinkedDevice): string {
  const signedIn =
    device.hasLiveCredential === null
      ? 'Signed in unknown'
      : device.hasLiveCredential
        ? 'Signed in'
        : 'Signed out';
  const parts = [signedIn];
  if (device.lastSeenAt) parts.push(`Last seen ${formatDateTime(device.lastSeenAt)}`);
  if (device.registeredAt) parts.push(`Linked ${formatDateTime(device.registeredAt)}`);
  return parts.join(' · ');
}

function readApiError(data: unknown, fallback: string): string {
  if (data === null || typeof data !== 'object' || !('error' in data)) return fallback;
  const error = (data as { error?: unknown }).error;
  // The server's words reach the screen, so they pass the same filter the rest
  // of the product uses: a sentence a person wrote survives, a trace id does
  // not. Measured with a 500 carrying "upstream exploded: trace 0xdeadbeef".
  const raw =
    typeof error === 'string' && error.trim()
      ? error
      : error !== null &&
          typeof error === 'object' &&
          'message' in error &&
          typeof (error as { message?: unknown }).message === 'string'
        ? ((error as { message: string }).message ?? '')
        : '';
  if (!raw.trim()) return fallback;
  return toUserMessage(new Error(raw), fallback);
}

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
      <div>
        <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
          Linked devices
        </p>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-3)' }}>
          {credentialStateKnown
            ? "Unlinking revokes the device's stored credential and removes it from this list. The app signs out the next time it reaches the server."
            : 'Sign-in state cannot be read on this deployment, so unlinking removes the device from this list without revoking its stored credential.'}
        </p>

        {loading ? (
          <div aria-hidden="true" className="flex flex-col gap-2">
            {[0, 1].map((row) => (
              <div key={row} className="h-10 w-full animate-pulse rounded bg-foreground/[0.07]" />
            ))}
          </div>
        ) : loadError ? (
          <div>
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
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>
            No desktop or mobile app is linked to this account.
          </p>
        ) : (
          devices.map((device, index) => (
            <div
              key={device.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                padding: '14px 0',
                borderTop: index === 0 ? 'none' : '1px solid var(--settings-border)',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: 'var(--text-1)' }}>
                  {describe(device)}
                  {device.version ? (
                    <span style={{ color: 'var(--text-3)' }}> · {device.version}</span>
                  ) : null}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  {describeState(device)}
                </div>
              </div>
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
                  flexShrink: 0,
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
            </div>
          ))
        )}

        {actionError ? (
          <p
            role="alert"
            style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--settings-destructive-text)' }}
          >
            {actionError}
          </p>
        ) : null}
      </div>
    </>
  );
}
