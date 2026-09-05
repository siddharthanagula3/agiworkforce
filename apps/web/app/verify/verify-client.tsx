'use client';

import Link from 'next/link';
import { useSession } from '@/lib/identity/client';
import { useState } from 'react';
import { Button } from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';

function getErrorMessage(data: { error?: unknown } | null): string {
  const error = data?.error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Request failed';
}

export function VerifyDeviceClient({ code }: { code: string }) {
  const { isLoaded, isSignedIn } = useSession();
  const [loading, setLoading] = useState<'approve' | 'deny' | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const signInHref = `/login?redirectTo=${encodeURIComponent(`/verify?code=${encodeURIComponent(code)}`)}`;

  const submit = async (action: 'approve' | 'deny') => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setMessage({
        type: 'error',
        text: 'Sign in before approving or denying this device request.',
      });
      return;
    }

    setLoading(action);
    setMessage(null);

    try {
      const csrfRes = await fetch('/api/csrf', { method: 'GET', credentials: 'include' });
      const csrfJson = (await csrfRes.json().catch(() => null)) as { token?: string } | null;
      if (!csrfRes.ok || !csrfJson?.token) {
        throw new Error('Failed to acquire CSRF token');
      }

      const res = await fetch('/api/device/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfJson.token,
        },
        credentials: 'include',
        body: JSON.stringify({ code, action }),
      });

      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        status?: string;
        error?: { message?: string };
      } | null;

      if (!res.ok) {
        throw new Error(getErrorMessage(data));
      }

      if (action === 'approve') {
        setMessage({
          type: 'success',
          text: 'Approved. Return to your device to finish signing in.',
        });
      } else {
        setMessage({ type: 'success', text: 'Denied.' });
      }
    } catch (e) {
      setMessage({
        type: 'error',
        text: toUserMessage(e, 'Unexpected error'),
      });
    } finally {
      setLoading(null);
    }
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
          Sign in before approving or denying this device request.
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

      <div className="grid grid-cols-2 gap-3">
        <Button
          onClick={() => submit('deny')}
          disabled={!isLoaded || loading !== null}
          variant="outline"
        >
          {!isLoaded ? 'Checking...' : loading === 'deny' ? 'Denying...' : 'Deny'}
        </Button>

        <Button onClick={() => submit('approve')} disabled={!isLoaded || loading !== null}>
          {!isLoaded ? 'Checking...' : loading === 'approve' ? 'Approving...' : 'Approve'}
        </Button>
      </div>
    </div>
  );
}
