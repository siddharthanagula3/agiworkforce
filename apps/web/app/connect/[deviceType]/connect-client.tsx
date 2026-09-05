'use client';

import Link from 'next/link';
import { useSession } from '@/lib/identity/client';
import { useState } from 'react';
import { Button } from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';

export const KNOWN_DEVICE_TYPES = [
  'vscode',
  'cursor',
  'windsurf',
  'antigravity',
  'desktop',
  'cli',
] as const;

export function isKnownDeviceType(deviceType: string): boolean {
  return (KNOWN_DEVICE_TYPES as readonly string[]).includes(deviceType.toLowerCase());
}

export function friendlyDeviceName(deviceType: string): string {
  switch (deviceType.toLowerCase()) {
    case 'vscode':
      return 'VS Code';
    case 'cursor':
      return 'Cursor';
    case 'windsurf':
      return 'Windsurf';
    case 'antigravity':
      return 'Antigravity';
    case 'desktop':
      return 'AGI Desktop';
    case 'cli':
      return 'AGI CLI';
    default:
      return deviceType || 'this device';
  }
}

export function ConnectDeviceClient({
  deviceId,
  deviceFingerprint,
  deviceType,
}: {
  deviceId: string;
  deviceFingerprint: string | null;
  deviceType: string;
}) {
  const { isLoaded, isSignedIn } = useSession();
  const [loading, setLoading] = useState<'approve' | 'deny' | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const name = friendlyDeviceName(deviceType);
  const returnTo =
    `/connect/${encodeURIComponent(deviceType)}?device_id=${encodeURIComponent(deviceId)}` +
    (deviceFingerprint ? `&device_fingerprint=${encodeURIComponent(deviceFingerprint)}` : '');
  const signInHref = `/login?redirectTo=${encodeURIComponent(returnTo)}`;

  const freshCsrf = async (): Promise<string> => {
    const res = await fetch('/api/csrf', { method: 'GET', credentials: 'include' });
    const json = (await res.json().catch(() => null)) as { token?: string } | null;
    if (!res.ok || !json?.token) throw new Error('Failed to acquire CSRF token');
    return json.token;
  };

  const errText = (data: { error?: unknown } | null, fallback: string): string => {
    const error = data?.error;
    if (typeof error === 'string' && error.trim()) return error;
    if (error && typeof error === 'object' && 'message' in error) {
      const m = (error as { message?: unknown }).message;
      if (typeof m === 'string' && m.trim()) return m;
    }
    return fallback;
  };

  const approve = async () => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setMessage({ type: 'error', text: 'Sign in before approving this device request.' });
      return;
    }
    setLoading('approve');
    setMessage(null);
    try {
      const linkRes = await fetch('/api/device/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': await freshCsrf() },
        credentials: 'include',
        body: JSON.stringify({
          device_id: deviceId,
          device_type: deviceType,
          device_fingerprint: deviceFingerprint,
          device_name: name,
        }),
      });
      const linkData = (await linkRes.json().catch(() => null)) as {
        link_code?: string;
        error?: { message?: string };
      } | null;
      if (!linkRes.ok || !linkData?.link_code) {
        throw new Error(errText(linkData, 'Failed to start device sign-in'));
      }

      const approveRes = await fetch('/api/device/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': await freshCsrf() },
        credentials: 'include',
        body: JSON.stringify({ code: linkData.link_code, action: 'approve' }),
      });
      if (!approveRes.ok) {
        const d = (await approveRes.json().catch(() => null)) as { error?: unknown } | null;
        throw new Error(errText(d, 'Failed to approve device'));
      }

      setMessage({ type: 'success', text: `Approved. Return to ${name} to finish signing in.` });
    } catch (e) {
      setMessage({ type: 'error', text: toUserMessage(e, 'Unexpected error') });
    } finally {
      setLoading(null);
    }
  };

  const deny = () => {
    setMessage({
      type: 'success',
      text: `Denied. ${name} was not granted access to your account.`,
    });
  };

  if (isLoaded && !isSignedIn) {
    return (
      <div className="mt-5 space-y-3">
        <div
          role="alert"
          style={{
            border: '1px solid var(--agi-rule)',
            borderRadius: 8,
            color: 'var(--agi-error)',
            padding: '12px 14px',
            fontSize: 14,
          }}
        >
          Sign in before approving this device request.
        </div>
        <Link
          href={signInHref}
          className="agi-ds-btn"
          data-variant="primary"
          style={{ display: 'flex' }}
        >
          Sign in to continue
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-3">
      {message ? (
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          style={{
            border: '1px solid var(--agi-rule)',
            borderRadius: 8,
            color: message.type === 'success' ? 'var(--agi-success)' : 'var(--agi-error)',
            padding: '12px 14px',
            fontSize: 14,
          }}
        >
          {message.text}
        </div>
      ) : null}

      <p role="note" style={{ fontSize: 13, color: 'var(--agi-muted, inherit)' }}>
        Approve only if you started this sign-in on {name} moments ago. Approving signs that device
        into your account; if you did not start it, choose Deny.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Button onClick={deny} disabled={!isLoaded || loading !== null} variant="outline">
          {loading === 'deny' ? 'Denying...' : 'Deny'}
        </Button>
        <Button onClick={approve} disabled={!isLoaded || loading !== null}>
          {!isLoaded ? 'Checking...' : loading === 'approve' ? 'Approving...' : 'Approve'}
        </Button>
      </div>
    </div>
  );
}
