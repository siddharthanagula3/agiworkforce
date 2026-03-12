/**
 * ShareArtifactDialog
 *
 * A modal dialog that generates and displays a shareable URL for an artifact.
 * Supports two expiry modes: 7-day expiry and no expiry.
 * Calls `shareArtifact` from the artifact-sharing service (Agent C).
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Link2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { shareArtifact, type ShareResult } from '@/services/artifactSharing';
import type { Artifact } from '@/stores/artifactStore';

interface ShareArtifactDialogProps {
  artifact: Artifact;
  isOpen: boolean;
  onClose: () => void;
}

type ExpiryMode = 'seven-days' | 'never';

export function ShareArtifactDialog({ artifact, isOpen, onClose }: ShareArtifactDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [shareResult, setShareResult] = useState<ShareResult | null>(null);
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>('seven-days');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Generate share URL when dialog opens or expiry mode changes
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    // Re-generate when expiry mode changes or dialog first opens
    const generate = async () => {
      setIsLoading(true);
      setError(null);
      setShareResult(null);
      try {
        const result = await shareArtifact({
          id: artifact.id,
          title: artifact.title,
          type: artifact.artifact_type,
          content: artifact.content,
          language: (
            artifact.metadata as Record<string, unknown> & { Code?: { language?: string } }
          )?.Code?.language,
        });
        setShareResult(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate share link');
      } finally {
        setIsLoading(false);
      }
    };

    void generate();
  }, [isOpen, expiryMode, artifact.id, artifact.title, artifact.artifact_type, artifact.content, artifact.metadata]);

  const handleCopy = useCallback(async () => {
    if (!shareResult?.url) return;
    try {
      await navigator.clipboard.writeText(shareResult.url);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  }, [shareResult?.url]);

  const handleExpiryChange = (mode: ExpiryMode) => {
    if (mode === expiryMode) return;
    setExpiryMode(mode);
  };

  if (!isOpen) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 p-6">
        {/* Close button */}
        <button type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/10">
            <Link2 className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Share Artifact
            </h2>
            <p className="text-xs text-zinc-500 truncate max-w-[280px]">{artifact.title}</p>
          </div>
        </div>

        {/* Expiry toggle */}
        <div className="mb-4">
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">Link expiry</p>
          <div className="flex gap-2">
            <button type="button"
              onClick={() => handleExpiryChange('seven-days')}
              className={cn(
                'flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                expiryMode === 'seven-days'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800',
              )}
            >
              Expire after 7 days
            </button>
            <button type="button"
              onClick={() => handleExpiryChange('never')}
              className={cn(
                'flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                expiryMode === 'never'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800',
              )}
            >
              Never expire
            </button>
          </div>
        </div>

        {/* URL field */}
        <div className="mb-4">
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">
            Shareable link
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={
                isLoading
                  ? 'Generating link...'
                  : error
                    ? 'Error generating link'
                    : (shareResult?.url ?? '')
              }
              className={cn(
                'flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700',
                'bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300',
                'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
                'truncate',
                error && 'border-red-300 dark:border-red-700 text-red-500',
              )}
            />
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleCopy}
              disabled={isLoading || !shareResult?.url}
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
          {shareResult && !error && (
            <p className="mt-1 text-xs text-zinc-400">
              Method:{' '}
              <span className="font-medium">
                {shareResult.method === 'base64' ? 'Encoded in URL' : 'Stored in cloud'}
              </span>
              {shareResult.expiresAt && (
                <span> · Expires {new Date(shareResult.expiresAt).toLocaleDateString()}</span>
              )}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleCopy}
            disabled={isLoading || !shareResult?.url}
            className="text-xs gap-1.5"
          >
            <Copy className="h-3 w-3" />
            Copy link
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ShareArtifactDialog;
