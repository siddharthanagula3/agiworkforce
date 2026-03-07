'use client';

import { useState, useEffect } from 'react';
import { Copy, Check, Trash2 } from 'lucide-react';

interface ShareDialogProps {
  title?: string;
  messages?: Record<string, unknown>[];
  onClose: () => void;
}

export function ShareDialog({ title, messages = [], onClose }: ShareDialogProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [messageCount, setMessageCount] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const createShare = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title ?? 'Shared Session', messages }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? 'Failed to create share link');
        }
        const data = (await res.json()) as {
          shareUrl: string;
          token: string;
          expiresAt: string;
          messageCount: number;
        };
        setShareUrl(data.shareUrl);
        setToken(data.token);
        setExpiresAt(data.expiresAt);
        setMessageCount(data.messageCount);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create share');
      } finally {
        setLoading(false);
      }
    };

    void createShare();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const copyUrl = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const revokeShare = async () => {
    if (!token) return;
    await fetch(`/api/share/${token}`, { method: 'DELETE' });
    setShareUrl(null);
    setToken(null);
    setExpiresAt(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-dialog-title"
    >
      <div className="w-full max-w-md rounded-xl bg-gray-900 p-6 shadow-xl">
        <h2 id="share-dialog-title" className="mb-4 text-lg font-semibold text-white">
          Share Session
        </h2>

        {loading && <p className="text-sm text-gray-400">Creating share link...</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {shareUrl && (
          <div className="space-y-4">
            <div className="rounded-lg bg-white/5 p-3">
              <p className="break-all text-sm text-gray-300">{shareUrl}</p>
            </div>
            <div className="flex gap-2 text-xs text-gray-500">
              <span>{messageCount} messages</span>
              <span aria-hidden="true">·</span>
              <span>
                Expires {expiresAt ? new Date(expiresAt).toLocaleDateString() : 'in 7 days'}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void copyUrl()}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500"
                aria-label={copied ? 'Copied!' : 'Copy share link'}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
              <button
                onClick={() => void revokeShare()}
                className="rounded-lg bg-red-600/20 px-3 py-2 text-sm text-red-400 hover:bg-red-600/30"
                aria-label="Revoke share link"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/20"
        >
          Close
        </button>
      </div>
    </div>
  );
}
