/**
 * ShareConversationDialog
 *
 * A modal dialog that generates and displays a shareable URL for a conversation.
 * Follows the same pattern as ShareArtifactDialog for design consistency.
 */

import { useCallback, useState } from 'react';
import { Check, Copy, Link2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { invoke } from '../../lib/tauri-mock';

interface ShareConversationDialogProps {
  conversationId: string;
  conversationTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ShareConversationDialog({
  conversationId,
  conversationTitle,
  isOpen,
  onClose,
}: ShareConversationDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateLink = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setShareUrl(null);
    try {
      // TODO: conversation_share command needs to be added to the Rust backend.
      // See docs/rust-fixes-needed.md for the spec.
      const result = await invoke<{ url: string }>('conversation_share', {
        conversationId,
      });
      setShareUrl(result.url);
    } catch {
      setError('Failed to generate share link');
      toast.error('Failed to generate share link');
    } finally {
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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 p-6">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 dark:bg-teal-500/10">
            <Link2 className="h-5 w-5 text-teal-500" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Share Conversation
            </h2>
            <p className="text-xs text-zinc-500 truncate max-w-[280px]">
              {conversationTitle}
            </p>
          </div>
        </div>

        {/* URL field or generate button */}
        <div className="mb-4">
          {!shareUrl && !error ? (
            <Button
              onClick={generateLink}
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? 'Generating...' : 'Generate Share Link'}
            </Button>
          ) : (
            <>
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                Shareable link
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={error ? 'Error generating link' : (shareUrl ?? '')}
                  className={cn(
                    'flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700',
                    'bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300',
                    'focus:outline-none focus:ring-2 focus:ring-teal-500/50',
                    'truncate',
                    error && 'border-red-300 dark:border-red-700 text-red-500',
                  )}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={handleCopy}
                  disabled={isLoading || !shareUrl}
                  title="Copy link"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>
          {shareUrl && (
            <Button
              variant="default"
              size="sm"
              onClick={handleCopy}
              disabled={isLoading || !shareUrl}
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
