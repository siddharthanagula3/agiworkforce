/**
 * ArtifactToolbar Component
 *
 * Toolbar displayed on artifacts in chat messages with quick actions.
 */

import { Check, Copy, Download, ExternalLink, Share2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ArtifactTypeIcon, getArtifactFileExtension } from '@/lib/artifactUtils';
import { Button } from '@/components/ui/Button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { useShallow } from 'zustand/react/shallow';
import { useArtifactStore, type ArtifactType } from '@/stores/artifactStore';
import { shareArtifact } from '@/services/artifactSharing';

interface ArtifactToolbarProps {
  artifactId: string;
  artifactType: ArtifactType;
  title: string;
  content: string;
  className?: string;
}

export function ArtifactToolbar({
  artifactId,
  artifactType,
  title,
  content,
  className,
}: ArtifactToolbarProps) {
  const { setActiveArtifact, openPanel } = useArtifactStore(
    useShallow((s) => ({ setActiveArtifact: s.setActiveArtifact, openPanel: s.openPanel })),
  );
  const [copied, setCopied] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'artifact'}.${getArtifactFileExtension(artifactType)}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('Downloaded');
  }, [content, title, artifactType]);

  const handleOpenInPanel = useCallback(() => {
    setActiveArtifact(artifactId);
    openPanel();
  }, [artifactId, setActiveArtifact, openPanel]);

  const handleShare = useCallback(async () => {
    if (isSharing) return;
    setIsSharing(true);
    try {
      const result = await shareArtifact({
        id: artifactId,
        title: title || 'Artifact',
        type: artifactType,
        content,
      });
      toast.success('Link ready', {
        description: result.url,
        action: {
          label: 'Copy',
          onClick: () => {
            void navigator.clipboard.writeText(result.url);
          },
        },
        duration: 8000,
      });
    } catch (err) {
      toast.error('Failed to generate share link', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsSharing(false);
    }
  }, [artifactId, title, artifactType, content, isSharing]);

  return (
    <div
      className={cn(
        'flex items-center gap-1 px-2 py-1 bg-zinc-100 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700',
        className,
      )}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <ArtifactTypeIcon type={artifactType} className="h-3.5 w-3.5 text-zinc-500" />
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">
          {title || `${formatType(artifactType)} Artifact`}
        </span>
      </div>
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
              {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copied ? 'Copied!' : 'Copy'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleDownload}>
              <Download className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleShare}
              disabled={isSharing}
            >
              <Share2 className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isSharing ? 'Generating link...' : 'Share'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleOpenInPanel}>
              <ExternalLink className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open in panel</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function formatType(type: ArtifactType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}
