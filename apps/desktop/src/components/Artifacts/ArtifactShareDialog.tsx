/**
 * ArtifactShareDialog — Radix Dialog with share link, download, pin toggle, and tag management.
 */

import { Check, Copy, Download, Loader2, Pin, PinOff, Share2, Tag, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Separator } from '@/components/ui/Separator';
import { Switch } from '@/components/ui/Switch';
import { useArtifactStore, type Artifact } from '@/stores/artifactStore';
import { getArtifactFileExtension } from '@/lib/artifactUtils';
import { shareArtifact } from '@/services/artifactSharing';

interface ArtifactShareDialogProps {
  artifact: Artifact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ArtifactShareDialog({ artifact, open, onOpenChange }: ArtifactShareDialogProps) {
  const { pinArtifact, addTags, removeTags } = useArtifactStore();

  const [shareUrl, setShareUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pinned, setPinned] = useState(artifact.pinned);
  const [isPinning, setIsPinning] = useState(false);
  const [tags, setTags] = useState<string[]>(artifact.tags);
  const [tagInput, setTagInput] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPinned(artifact.pinned);
    setTags(artifact.tags);
  }, [artifact.pinned, artifact.tags]);

  useEffect(() => {
    if (!open) {
      setShareUrl('');
      setShareError(null);
      setCopied(false);
      return;
    }
    let cancelled = false;
    setIsGenerating(true);
    setShareError(null);
    shareArtifact({
      id: artifact.id,
      title: artifact.title,
      type: artifact.artifact_type,
      content: artifact.content,
      language: (artifact.metadata as Record<string, unknown> & { Code?: { language?: string } })
        ?.Code?.language,
    })
      .then((r) => {
        if (!cancelled) setShareUrl(r.url);
      })
      .catch((err) => {
        if (!cancelled)
          setShareError(err instanceof Error ? err.message : 'Failed to generate link');
      })
      .finally(() => {
        if (!cancelled) setIsGenerating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    artifact.id,
    artifact.title,
    artifact.artifact_type,
    artifact.content,
    artifact.metadata,
  ]);

  const handleCopyLink = useCallback(async () => {
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

  const handleDownload = useCallback(() => {
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title || 'artifact'}.${getArtifactFileExtension(artifact.artifact_type)}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('Artifact downloaded');
  }, [artifact.content, artifact.title, artifact.artifact_type]);

  const handlePinToggle = useCallback(async () => {
    if (isPinning) return;
    const next = !pinned;
    setPinned(next);
    setIsPinning(true);
    try {
      const ok = await pinArtifact(artifact.id, next);
      if (ok) toast.success(next ? 'Artifact pinned' : 'Artifact unpinned');
      else {
        setPinned(!next);
        toast.error('Failed to update pin');
      }
    } catch {
      setPinned(!next);
      toast.error('Failed to update pin');
    } finally {
      setIsPinning(false);
    }
  }, [artifact.id, pinned, isPinning, pinArtifact]);

  const handleAddTag = useCallback(async () => {
    const tag = tagInput.trim().toLowerCase();
    if (!tag || tags.includes(tag)) {
      setTagInput('');
      return;
    }
    const prev = tags;
    setTags([...prev, tag]);
    setTagInput('');
    const ok = await addTags(artifact.id, [tag]);
    if (!ok) {
      setTags(prev);
      toast.error('Failed to add tag');
    }
  }, [artifact.id, tags, tagInput, addTags]);

  const handleRemoveTag = useCallback(
    async (tag: string) => {
      const prev = tags;
      setTags(prev.filter((t) => t !== tag));
      const ok = await removeTags(artifact.id, [tag]);
      if (!ok) {
        setTags(prev);
        toast.error('Failed to remove tag');
      }
    },
    [artifact.id, tags, removeTags],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            Share Artifact
          </DialogTitle>
          <DialogDescription className="truncate">{artifact.title}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Share link */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Shareable link</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={
                  isGenerating ? 'Generating...' : shareError ? 'Error generating link' : shareUrl
                }
                className={cn(
                  'flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800',
                  'px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50 truncate',
                  shareError && 'border-red-300 dark:border-red-700 text-red-500',
                )}
              />
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={handleCopyLink}
                disabled={isGenerating || !shareUrl}
                title="Copy link"
              >
                {isGenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : copied ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            {shareError && <p className="text-xs text-red-500">{shareError}</p>}
          </div>

          <Separator />

          {/* Download */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Download artifact
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Save as{' '}
                <span className="font-mono">
                  {artifact.title || 'artifact'}.{getArtifactFileExtension(artifact.artifact_type)}
                </span>
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="gap-1.5 text-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          </div>

          <Separator />

          {/* Pin toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {pinned ? (
                <Pin className="h-4 w-4 text-blue-500" />
              ) : (
                <PinOff className="h-4 w-4 text-zinc-400" />
              )}
              <div>
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {pinned ? 'Pinned' : 'Pin artifact'}
                </p>
                <p className="text-xs text-zinc-500">Pinned artifacts appear at the top</p>
              </div>
            </div>
            <Switch
              checked={pinned}
              onCheckedChange={handlePinToggle}
              disabled={isPinning}
              aria-label="Pin artifact"
            />
          </div>

          <Separator />

          {/* Tags */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-zinc-400" />
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Tags</p>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs gap-1 pr-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => void handleRemoveTag(tag)}
                      className="ml-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-600 p-0.5 transition-colors"
                      aria-label={`Remove tag ${tag}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Input
                ref={tagInputRef}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleAddTag();
                  }
                }}
                placeholder="Add a tag..."
                className="h-8 text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs shrink-0"
                onClick={() => void handleAddTag()}
                disabled={!tagInput.trim()}
              >
                Add
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Close
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleCopyLink}
            disabled={isGenerating || !shareUrl}
            className="text-xs gap-1.5"
          >
            <Copy className="h-3 w-3" />
            Copy link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ArtifactShareDialog;
