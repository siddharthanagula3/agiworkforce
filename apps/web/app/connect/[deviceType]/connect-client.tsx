'use client';

import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { useState } from 'react';
import { Button } from '@agiworkforce/ui';

/** Human label for a device_type slug (falls back to the raw slug). */
/// Device types that can actually complete a pairing. The route is dynamic, so
/// without this list `/connect/<anything>` rendered a full "Connect X to AGI?"
/// approval screen — including the security notice — for a device that does not
/// exist. An approval prompt for a made-up device is a phishing primitive, not
/// just a cosmetic 404.
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

/**
 * Device-connect approval for the editor/CLI device-code flow.
 *
 * The extension opens /connect/<deviceType>?device_id=…&device_fingerprint=…
 * and polls POST /api/device/poll for {status:'approved', access_token}. The
 * extension is not yet authenticated, so the ROW for its device_id must be
 * created + approved here, by the signed-in browser session. We reuse the two
 * existing endpoints rather than adding a third:
 *   1. POST /api/device/link    — upserts a pending row for this device_id.
 *   2. POST /api/device/approve — binds this user + mints the access token
 *      (encryptToken(getToken())) that the device poll returns.
 */
export function ConnectDeviceClient({
  deviceId,
  deviceFingerprint,
  deviceType,
}: {
  deviceId: string;
  deviceFingerprint: string | null;
  deviceType: string;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const [loading, setLoading] = useState<'approve' | 'deny' | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const name = friendlyDeviceName(deviceType);
  const returnTo =
    `/connect/${encodeURIComponent(deviceType)}?device_id=${encodeURIComponent(deviceId)}` +
    (deviceFingerprint ? `&device_fingerprint=${encodeURIComponent(deviceFingerprint)}` : '');
  const signInHref = `/login?redirectTo=${encodeURIComponent(returnTo)}`;

  // Fetch a fresh CSRF token per state-changing call (double-submit pattern).
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
      // 1. Create/refresh the pending device row bound to this device_id.
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

      // 2. Approve it — mints the access token this device will poll for.
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
      setMessage({ type: 'error', text: e instanceof Error ? e.message : 'Unexpected error' });
    } finally {
      setLoading(null);
    }
  };

  // Deny never creates/approves a row, so the requesting device simply times
  // out — the correct outcome for a rejected request.
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
        <Link href={signInHref} className="agi-cta-primary" style={{ display: 'block' }}>
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
