/**
 * ShareConversationDialog
 *
 * Modal dialog that packages a conversation for sharing via a unique URL.
 * The desktop calls `conversation_share` (Rust) to get the messages + token,
 * then POSTs them to the web app's `/api/shared` endpoint.
 * Anyone with the resulting URL can view the conversation read-only for 30 days.
 */

import { useCallback, useState } from 'react';
import { Check, Copy, Link2, Loader2, Share2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { invoke } from '@/lib/tauri-mock';

interface ShareConversationDialogProps {
  conversationId: string;
  conversationTitle?: string;
  isOpen: boolean;
  onClose: () => void;
}

interface SharePayload {
  token: string;
  messagesJson: string;
  conversationId: string;
  title: string;
}

// VITE_WEB_APP_URL must be set in the desktop's .env file for production.
const WEB_APP_URL: string =
  (import.meta.env['VITE_WEB_APP_URL'] as string | undefined) ?? 'https://agiworkforce.com';

export function ShareConversationDialog({
  conversationId,
  isOpen,
  onClose,
}: ShareConversationDialogProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    // BUG-347: Use AbortController with 30s timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const result = await invoke<SharePayload>('conversation_share', { conversationId });

      const response = await fetch(`${WEB_APP_URL}/api/shared`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: result.token,
          messages: result.messagesJson,
          title: result.title,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Server responded with ${response.status}`);
      }

      const data = (await response.json()) as { url: string };
      setShareUrl(data.url);
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'AbortError'
          ? 'Request timed out after 30 seconds'
          : err instanceof Error
            ? err.message
            : 'Failed to create share link';
      setError(message);
      toast.error('Failed to create share link');
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  }, [conversationId]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  }, [shareUrl]);

  const handleClose = useCallback(() => {
    // Reset state when dialog closes so it is fresh on next open
    setShareUrl(null);
    setError(null);
    setCopied(false);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 p-6">
        {/* Close button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/10">
            <Share2 className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Share Conversation
            </h2>
            <p className="text-xs text-zinc-500">Create a public link anyone can view</p>
          </div>
        </div>

        {/* Body */}
        {!shareUrl ? (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Generate a read-only link to this conversation. The link expires in 30 days.
            </p>

            {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

            <Button
              variant="default"
              className="w-full gap-2"
              onClick={() => void handleShare()}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              {isLoading ? 'Creating link\u2026' : 'Create Share Link'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                Shareable link
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className={cn(
                    'flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700',
                    'bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300',
                    'focus:outline-none focus:ring-2 focus:ring-blue-500/50 truncate',
                  )}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => void handleCopy()}
                  title="Copy link"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <p className="mt-1 text-xs text-zinc-400">Expires in 30 days.</p>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={handleClose} className="text-xs">
            Close
          </Button>
          {shareUrl && (
            <Button
              variant="default"
              size="sm"
              onClick={() => void handleCopy()}
              className="text-xs gap-1.5"
            >
              <Copy className="h-3 w-3" />
              Copy link
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ShareConversationDialog;
