'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';

export function VerifyDeviceClient({ code }: { code: string }) {
  const [loading, setLoading] = useState<'approve' | 'deny' | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const submit = async (action: 'approve' | 'deny') => {
    setLoading(action);
    setMessage(null);

    try {
      const res = await fetch('/api/device/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, action }),
      });

      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        status?: string;
        error?: { message?: string };
      } | null;

      if (!res.ok) {
        const errMsg = data?.error?.message || 'Request failed';
        throw new Error(errMsg);
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
        text: e instanceof Error ? e.message : 'Unexpected error',
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="mt-5 space-y-3">
      {message ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-700/40 bg-emerald-950/30 text-emerald-200'
              : 'border-red-700/40 bg-red-950/30 text-red-200'
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Button
          onClick={() => submit('deny')}
          disabled={loading !== null}
          variant="outline"
          className="border-zinc-700 text-zinc-200 hover:bg-zinc-900"
        >
          {loading === 'deny' ? 'Denying…' : 'Deny'}
        </Button>

        <Button
          onClick={() => submit('approve')}
          disabled={loading !== null}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {loading === 'approve' ? 'Approving…' : 'Approve'}
        </Button>
      </div>
    </div>
  );
}
