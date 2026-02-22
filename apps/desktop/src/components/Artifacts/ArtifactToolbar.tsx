/**
 * ArtifactToolbar Component
 *
 * Toolbar displayed on artifacts in chat messages with quick actions.
 */

import {
  Check,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Globe,
  Network,
  Presentation,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { useArtifactStore, type ArtifactType } from '@/stores/artifactStore';

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
  const { setActiveArtifact, openPanel } = useArtifactStore();
  const [copied, setCopied] = useState(false);

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
    a.download = `${title || 'artifact'}.${getExtension(artifactType)}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Downloaded');
  }, [content, title, artifactType]);

  const handleOpenInPanel = useCallback(() => {
    setActiveArtifact(artifactId);
    openPanel();
  }, [artifactId, setActiveArtifact, openPanel]);

  return (
    <div
      className={cn(
        'flex items-center gap-1 px-2 py-1 bg-zinc-100 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700',
        className
      )}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <TypeIcon type={artifactType} />
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">
          {title || `${formatType(artifactType)} Artifact`}
        </span>
      </div>
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copied ? 'Copied!' : 'Copy'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleDownload}
            >
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
              onClick={handleOpenInPanel}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open in panel</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function TypeIcon({ type }: { type: ArtifactType }) {
  const className = 'h-3.5 w-3.5 text-zinc-500';

  switch (type) {
    case 'code':
      return <Code2 className={className} />;
    case 'document':
      return <FileText className={className} />;
    case 'spreadsheet':
      return <FileSpreadsheet className={className} />;
    case 'diagram':
      return <Network className={className} />;
    case 'web':
      return <Globe className={className} />;
    case 'presentation':
      return <Presentation className={className} />;
    default:
      return <Code2 className={className} />;
  }
}

function formatType(type: ArtifactType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function getExtension(type: ArtifactType): string {
  switch (type) {
    case 'code':
      return 'txt';
    case 'document':
      return 'md';
    case 'spreadsheet':
      return 'csv';
    case 'diagram':
      return 'mmd';
    case 'web':
      return 'html';
    case 'chart':
      return 'json';
    case 'presentation':
      return 'md';
    default:
      return 'txt';
  }
}
