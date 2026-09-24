'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type {
  DeviceCapabilities,
  DevicePresence,
  DeviceSurface,
} from '@agiworkforce/cloud-contracts';
import { DEVICE_NAME_MAX_LENGTH } from '@agiworkforce/cloud-contracts';
import { useConfirmAction } from '@agiworkforce/ui';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';

export interface LinkedDevice {
  id: string;
  kind: DeviceSurface;
  name: string | null;
  platform: string | null;
  version: string | null;
  lastSeenAt: string | null;
  registeredAt: string | null;
  hasLiveCredential: boolean | null;
  osVersion?: string | null;
  architecture?: string | null;
  shell?: string | null;
  workspaceId?: string | null;
  presence?: DevicePresence | null;
  capabilities?: DeviceCapabilities | null;
}

const PLATFORM_LABELS: Record<string, string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
  ios: 'iOS',
  android: 'Android',
  chromeos: 'ChromeOS',
};

const SURFACE_LABELS: Record<DeviceSurface, string> = {
  desktop: 'Desktop app',
  cli: 'AGI CLI',
  vscode: 'VS Code extension',
  chrome: 'Chrome extension',
  mobile: 'Mobile app',
};

const PRESENCE_LABELS: Record<DevicePresence, string> = {
  online: 'Online',
  sleeping: 'Sleeping',
  offline: 'Offline',
};

const CAPABILITY_LABELS: Array<[keyof DeviceCapabilities, string]> = [
  ['browser', 'Browser'],
  ['computerUse', 'Computer use'],
  ['localModels', 'Local models'],
  ['localMcp', 'Local MCP'],
  ['remoteControl', 'Remote Control'],
];

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
  return device.name?.trim() || platform || SURFACE_LABELS[device.kind] || 'Linked app';
}

function describeSystem(device: LinkedDevice): string {
  const parts = [SURFACE_LABELS[device.kind] ?? device.kind];
  if (device.version) parts.push(device.version);
  const platform = device.platform ? (PLATFORM_LABELS[device.platform] ?? device.platform) : null;
  if (platform) {
    parts.push(
      [platform, device.osVersion, device.architecture].filter((part) => Boolean(part)).join(' '),
    );
  }
  if (device.workspaceId !== undefined) {
    parts.push(device.workspaceId ? 'Workspace sign-in' : 'Personal sign-in');
  }
  return parts.join(' · ');
}

function describeState(device: LinkedDevice): string {
  const signedIn =
    device.hasLiveCredential === null
      ? 'Signed in unknown'
      : device.hasLiveCredential
        ? 'Signed in'
        : 'Signed out';
  const parts = device.presence ? [PRESENCE_LABELS[device.presence], signedIn] : [signedIn];
  if (device.lastSeenAt) parts.push(`Last seen ${formatDateTime(device.lastSeenAt)}`);
  if (device.registeredAt) parts.push(`Linked ${formatDateTime(device.registeredAt)}`);
  return parts.join(' · ');
}

function describeCapabilities(device: LinkedDevice): string | null {
  if (!device.capabilities) return null;
  const available = CAPABILITY_LABELS.filter(([key]) => device.capabilities?.[key]).map(
    ([, label]) => label,
  );
  return available.length > 0 ? `Can use ${available.join(', ')}` : 'No local capabilities';
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
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);

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

  function startRename(device: LinkedDevice) {
    setActionError(null);
    setRenamingId(device.id);
    setDraftName(device.name?.trim() || describe(device));
  }

  async function handleRename(device: LinkedDevice) {
    const name = draftName.trim();
    if (!name) {
      setActionError('Give the device a name.');
      return;
    }
    setActionError(null);
    setSavingName(true);
    try {
      const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
      const response = await fetch(`/api/settings/devices/${encodeURIComponent(device.id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify({ name }),
      });
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readApiError(data, 'Unable to rename this device.'));
      setDevices((current) =>
        current.map((row) => (row.id === device.id ? { ...row, name } : row)),
      );
      setRenamingId(null);
    } catch (error) {
      setActionError(toUserMessage(error, 'Unable to rename this device.'));
    } finally {
      setSavingName(false);
    }
  }

  const secondaryButtonStyle = {
    flexShrink: 0,
    padding: 'var(--space-2) var(--space-3)',
    minHeight: 32,
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--text-1)',
    background: 'transparent',
    border: '1px solid var(--settings-border)',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  };

  return (
    <>
      {confirmDialog}
      <div>
        <p
          style={{
            margin: '0 0 var(--space-1)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-2)',
          }}
        >
          Linked devices
        </p>
        <p style={{ margin: '0 0 var(--space-2)', fontSize: 12, color: 'var(--text-3)' }}>
          {credentialStateKnown
            ? "Unlinking revokes the device's stored credential and removes it from this list. The app signs out the next time it reaches the server."
            : 'Sign-in state cannot be read on this deployment, so unlinking removes the device from this list without revoking its stored credential.'}
        </p>

        {loading ? (
          <div aria-hidden="true" className="flex flex-col gap-2">
            {[0, 1].map((row) => (
              <div key={row} className="h-10 w-full animate-pulse rounded-compact bg-foreground/[0.07]" />
            ))}
          </div>
        ) : loadError ? (
          <div>
            <p
              role="alert"
              style={{
                margin: '0 0 var(--space-3)',
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
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)',
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
            No app is linked to this account.
          </p>
        ) : (
          devices.map((device, index) => (
            <div
              key={device.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-4)',
                padding: 'var(--space-4) 0',
                borderTop: index === 0 ? 'none' : '1px solid var(--settings-border)',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                {renamingId === device.id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleRename(device);
                    }}
                    style={{
                      display: 'flex',
                      gap: 'var(--space-2)',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    <input
                      aria-label={`New name for ${describe(device)}`}
                      value={draftName}
                      maxLength={DEVICE_NAME_MAX_LENGTH}
                      autoFocus
                      onChange={(event) => setDraftName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setRenamingId(null);
                      }}
                      style={{
                        flex: '1 1 160px',
                        minWidth: 0,
                        minHeight: 32,
                        padding: 'var(--space-2) var(--space-2)',
                        fontSize: 14,
                        color: 'var(--text-1)',
                        background: 'transparent',
                        border: '1px solid var(--settings-border)',
                        borderRadius: 'var(--radius-md)',
                      }}
                    />
                    <button type="submit" disabled={savingName} style={secondaryButtonStyle}>
                      {savingName ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingId(null)}
                      disabled={savingName}
                      style={secondaryButtonStyle}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <div style={{ fontSize: 14, color: 'var(--text-1)' }}>{describe(device)}</div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
                  {describeSystem(device)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
                  {describeState(device)}
                </div>
                {describeCapabilities(device) ? (
                  <div
                    style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 'var(--space-1)' }}
                  >
                    {describeCapabilities(device)}
                  </div>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
                {renamingId === device.id ? null : (
                  <button
                    type="button"
                    onClick={() => startRename(device)}
                    disabled={unlinkingId !== null}
                    aria-label={`Rename ${describe(device)}`}
                    style={secondaryButtonStyle}
                  >
                    Rename
                  </button>
                )}
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
                    padding: 'var(--space-2) var(--space-3)',
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
            </div>
          ))
        )}

        {actionError ? (
          <p
            role="alert"
            style={{
              margin: 'var(--space-2) 0 0',
              fontSize: 12,
              color: 'var(--settings-destructive-text)',
            }}
          >
            {actionError}
          </p>
        ) : null}
      </div>
    </>
  );
}
