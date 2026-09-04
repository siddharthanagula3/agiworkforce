import { formatDistanceToNow } from 'date-fns';
import {
  Archive,
  ChevronDown,
  Clock,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FolderOpen,
  Globe,
  History,
  Maximize2,
  Minimize2,
  Pencil,
  Pin,
  PinOff,
  RefreshCw,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { toast } from 'sonner';
import { isTauri } from '@/lib/tauri-mock';
import { cn } from '@/lib/utils';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { ScrollArea } from '@/ui/ScrollArea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/Tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/Tooltip';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/ui/Dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/DropdownMenu';
import { useShallow } from 'zustand/react/shallow';
import {
  useArtifactStore,
  type Artifact,
  type ArtifactDiff,
  type ArtifactSummary,
  type ArtifactVersion,
  type RenderedArtifact,
} from '@/stores/artifactStore';
import { spreadsheetSafeExport } from '@agiworkforce/unified-chat';
import { ArtifactTypeIcon, getArtifactFileExtension } from '@/lib/artifactUtils';
import { artifactToSummary } from '@/lib/messageArtifactPanel';
import { ArtifactRendererView } from './ArtifactRendererView';
import { ArtifactVersionHistory } from './ArtifactVersionHistory';
import { InlineArtifactEditor } from './InlineArtifactEditor';
import { ShareArtifactDialog } from './ShareArtifactDialog';
import { makeDesktopPublishCallback } from './publishAdapter';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ArtifactPanelProps {
  conversationId?: number;
  className?: string;
  onClose?: () => void;
}

type InnerTab = 'preview' | 'code' | 'versions';

// every write of artifact.content to disk goes through here: a `spreadsheet` artifact
// is named .csv and handleOpenInSystemApp hands it straight to the OS spreadsheet app
function artifactDownloadFile(artifact: Artifact): { blob: Blob; filename: string } {
  const extension = getArtifactFileExtension(artifact.artifact_type);
  const { body, mimeType } = spreadsheetSafeExport(artifact.content, extension);
  return {
    blob: new Blob([body], { type: mimeType }),
    filename: `${artifact.title}.${extension}`,
  };
}

export function ArtifactPanel({ conversationId, className, onClose }: ArtifactPanelProps) {
  const {
    activeArtifactId,
    panelOpen,
    isStreaming,
    setActiveArtifact,
    closePanel,
    getArtifact,
    getRenderedArtifact,
    deleteArtifact,
    archiveArtifact,
    pinArtifact,
    rollbackArtifact,
    getArtifactsByConversation,
    applyDiffToArtifact,
    getVersionHistory,
  } = useArtifactStore(
    useShallow((s) => ({
      activeArtifactId: s.activeArtifactId,
      panelOpen: s.panelOpen,
      isStreaming: s.isStreaming,
      setActiveArtifact: s.setActiveArtifact,
      closePanel: s.closePanel,
      getArtifact: s.getArtifact,
      getRenderedArtifact: s.getRenderedArtifact,
      deleteArtifact: s.deleteArtifact,
      archiveArtifact: s.archiveArtifact,
      pinArtifact: s.pinArtifact,
      rollbackArtifact: s.rollbackArtifact,
      getArtifactsByConversation: s.getArtifactsByConversation,
      applyDiffToArtifact: s.applyDiffToArtifact,
      getVersionHistory: s.getVersionHistory,
    })),
  );

  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [renderedArtifact, setRenderedArtifact] = useState<RenderedArtifact | null>(null);
  const [versions, setVersions] = useState<ArtifactVersion[]>([]);
  const [showVersionHistoryDialog, setShowVersionHistoryDialog] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingArtifact, setEditingArtifact] = useState<Artifact | null>(null);
  const [shareDialogArtifactId, setShareDialogArtifactId] = useState<string | null>(null);
  const [innerTab, setInnerTab] = useState<InnerTab>('preview');
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  useEffect(() => {
    if (conversationId) {
      getArtifactsByConversation(conversationId)
        .then(setArtifacts)
        .catch((err: unknown) => {
          console.error('Failed to load artifacts:', err);
          toast.error('Failed to load artifacts');
        });
    }
  }, [conversationId, getArtifactsByConversation]);

  useEffect(() => {
    if (!activeArtifactId || artifacts.some((artifact) => artifact.id === activeArtifactId)) {
      return;
    }

    let cancelled = false;
    getArtifact(activeArtifactId)
      .then((artifact) => {
        if (!artifact || cancelled) return;
        setArtifacts((currentArtifacts) => {
          if (currentArtifacts.some((current) => current.id === artifact.id)) {
            return currentArtifacts;
          }
          return [artifactToSummary(artifact), ...currentArtifacts];
        });
      })
      .catch((err: unknown) => {
        console.error('Failed to load active artifact summary:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [activeArtifactId, artifacts, getArtifact]);

  useEffect(() => {
    if (activeArtifactId) {
      getRenderedArtifact(activeArtifactId)
        .then(setRenderedArtifact)
        .catch((err: unknown) => {
          console.error('Failed to load rendered artifact:', err);
        });
    } else {
      setRenderedArtifact(null);
    }
  }, [activeArtifactId, getRenderedArtifact, isStreaming]);

  useEffect(() => {
    if (isStreaming && activeArtifactId === isStreaming) {
      let cancelled = false;
      const interval = setInterval(() => {
        getRenderedArtifact(activeArtifactId)
          .then((r) => {
            if (!cancelled) setRenderedArtifact(r);
          })
          .catch((err: unknown) => {
            console.error('Failed to poll rendered artifact:', err);
          });
      }, 100);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }
    return undefined;
  }, [isStreaming, activeArtifactId, getRenderedArtifact]);

  useEffect(() => {
    if (innerTab === 'versions' && activeArtifactId) {
      setIsLoadingVersions(true);
      getVersionHistory(activeArtifactId)
        .then((v) => setVersions(v ?? []))
        .catch((err: unknown) => {
          console.error('Failed to load version history:', err);
          toast.error('Failed to load version history');
        })
        .finally(() => setIsLoadingVersions(false));
    }
  }, [innerTab, activeArtifactId, getVersionHistory]);

  useEffect(() => {
    setInnerTab('preview');
    setIsEditing(false);
    setEditingArtifact(null);
  }, [activeArtifactId]);

  const handleCopy = useCallback(async () => {
    if (!renderedArtifact) return;
    try {
      const artifact = await getArtifact(renderedArtifact.id);
      if (artifact) {
        await navigator.clipboard.writeText(artifact.content);
        toast.success('Copied to clipboard');
      }
    } catch (err: unknown) {
      console.error('Failed to copy artifact:', err);
      toast.error('Failed to copy to clipboard');
    }
  }, [renderedArtifact, getArtifact]);

  const handleDownload = useCallback(async () => {
    if (!renderedArtifact) return;
    try {
      const artifact = await getArtifact(renderedArtifact.id);
      if (!artifact) return;
      const { blob, filename } = artifactDownloadFile(artifact);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Downloaded artifact');
    } catch (err: unknown) {
      console.error('Failed to download artifact:', err);
      toast.error('Failed to download artifact');
    }
  }, [renderedArtifact, getArtifact]);

  const handleDelete = useCallback(async () => {
    if (!renderedArtifact) return;
    try {
      const success = await deleteArtifact(renderedArtifact.id);
      if (success) {
        toast.success('Artifact deleted');
        setArtifacts((prev) => prev.filter((a) => a.id !== renderedArtifact.id));
      }
    } catch (err: unknown) {
      console.error('Failed to delete artifact:', err);
      toast.error('Failed to delete artifact');
    }
  }, [renderedArtifact, deleteArtifact]);

  const handleArchive = useCallback(async () => {
    if (!renderedArtifact) return;
    try {
      const success = await archiveArtifact(renderedArtifact.id);
      if (success) toast.success('Artifact archived');
    } catch (err: unknown) {
      console.error('Failed to archive artifact:', err);
      toast.error('Failed to archive artifact');
    }
  }, [renderedArtifact, archiveArtifact]);

  const handlePin = useCallback(async () => {
    if (!renderedArtifact) return;
    try {
      const artifact = await getArtifact(renderedArtifact.id);
      if (!artifact) return;
      const success = await pinArtifact(renderedArtifact.id, !artifact.pinned);
      if (success) toast.success(artifact.pinned ? 'Unpinned artifact' : 'Pinned artifact');
    } catch (err: unknown) {
      console.error('Failed to pin artifact:', err);
      toast.error('Failed to pin artifact');
    }
  }, [renderedArtifact, getArtifact, pinArtifact]);

  const handleRollback = useCallback(
    async (version: number) => {
      if (!activeArtifactId) return;
      try {
        const artifact = await rollbackArtifact(activeArtifactId, version);
        if (artifact) {
          toast.success(`Rolled back to version ${version}`);
          setShowVersionHistoryDialog(false);
          getRenderedArtifact(activeArtifactId)
            .then(setRenderedArtifact)
            .catch((err: unknown) => {
              console.error('Failed to refresh artifact after rollback:', err);
            });
        }
      } catch (err: unknown) {
        console.error('Failed to rollback artifact:', err);
        toast.error('Failed to rollback artifact');
      }
    },
    [activeArtifactId, rollbackArtifact, getRenderedArtifact],
  );

  const handleEditSave = useCallback(
    async (diff: ArtifactDiff) => {
      if (!activeArtifactId) return;
      try {
        const artifact = await applyDiffToArtifact(activeArtifactId, diff);
        if (artifact) {
          toast.success('Artifact updated');
          setIsEditing(false);
          getRenderedArtifact(activeArtifactId)
            .then(setRenderedArtifact)
            .catch((err: unknown) => {
              console.error('Failed to refresh artifact after edit:', err);
            });
        } else {
          toast.error('Failed to save changes');
        }
      } catch (err: unknown) {
        console.error('Failed to apply diff to artifact:', err);
        toast.error('Failed to save changes');
      }
    },
    [activeArtifactId, applyDiffToArtifact, getRenderedArtifact],
  );

  const handleShare = useCallback(() => {
    if (!activeArtifactId) return;
    setShareDialogArtifactId(activeArtifactId);
  }, [activeArtifactId]);

  const handleFixBug = useCallback((errorMessage: string, source: string) => {
    const content = `Fix this bug in my artifact:\n\nError:\n${errorMessage}\n\nSource:\n\`\`\`\n${source}\n\`\`\``;
    window.dispatchEvent(new CustomEvent('chat:action', { detail: { type: 'fix-bug', content } }));
  }, []);

  const handlePublish = useCallback(async () => {
    if (!activeArtifactId) return;
    try {
      const artifact = await getArtifact(activeArtifactId);
      if (!artifact) {
        toast.error('Could not load artifact content for publishing');
        return;
      }
      const language =
        (artifact.metadata as Record<string, unknown> & { Code?: { language?: string } })?.Code
          ?.language ?? undefined;

      const publishFn = makeDesktopPublishCallback({
        id: artifact.id,
        title: artifact.title,
        content: artifact.content,
        type: artifact.artifact_type,
        language,
      });

      const result = await publishFn();

      toast.success(`Artifact saved to ${result.shareUrl}`, {
        action: {
          label: 'Copy path',
          onClick: () => void navigator.clipboard.writeText(result.shareUrl),
        },
        duration: 6000,
      });
    } catch (err) {
      console.error('[ArtifactPanel] handlePublish failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to publish artifact');
    }
  }, [activeArtifactId, getArtifact]);

  const handleRefreshRenderedArtifact = useCallback(async () => {
    if (!activeArtifactId) return;
    try {
      const refreshed = await getRenderedArtifact(activeArtifactId);
      setRenderedArtifact(refreshed);
      toast.success('Artifact refreshed');
    } catch (err: unknown) {
      console.error('Failed to refresh artifact:', err);
      toast.error('Failed to refresh artifact');
    }
  }, [activeArtifactId, getRenderedArtifact]);

  const handleOpenInSystemApp = useCallback(async () => {
    if (!renderedArtifact) return;
    try {
      const artifact = await getArtifact(renderedArtifact.id);
      if (!artifact) return;
      const { blob, filename } = artifactDownloadFile(artifact);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (isTauri) {
        await shellOpen(filename).catch(() => {});
      }
      toast.success(`Saved and opening ${filename}`);
    } catch (err: unknown) {
      console.error('Failed to open artifact in system app:', err);
      toast.error('Failed to open in system app');
    }
  }, [renderedArtifact, getArtifact]);

  const handleDownloadAll = useCallback(async () => {
    if (artifacts.length === 0) return;
    let succeeded = 0;
    for (const summary of artifacts) {
      try {
        const artifact = await getArtifact(summary.id);
        if (!artifact) continue;
        const { blob, filename } = artifactDownloadFile(artifact);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        succeeded++;
      } catch (err: unknown) {
        console.error(`Failed to download artifact ${summary.id}:`, err);
      }
    }
    if (succeeded > 0) {
      toast.success(`Downloaded ${succeeded} artifact${succeeded > 1 ? 's' : ''}`);
    } else {
      toast.error('No artifacts could be downloaded');
    }
  }, [artifacts, getArtifact]);

  const handleInnerTabChange = useCallback(
    (value: InnerTab) => {
      if (isEditing) {
        setIsEditing(false);
        setEditingArtifact(null);
      }
      setInnerTab(value);
    },
    [isEditing],
  );

  if (!panelOpen) return null;

  const activeArtifact = artifacts.find((a) => a.id === activeArtifactId);

  return (
    <>
      <div
        className={cn(
          'flex flex-col bg-zinc-50 dark:bg-zinc-950 h-full',
          isExpanded && 'fixed inset-0 z-50',
          className,
        )}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-zinc-500" />
            <span className="font-medium text-sm">Artifacts</span>
            {artifacts.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {artifacts.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {artifacts.length > 1 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => void handleDownloadAll()}
                    aria-label="Download all artifacts"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download all ({artifacts.length})</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setIsExpanded(!isExpanded)}
                  aria-label={isExpanded ? 'Minimize panel' : 'Maximize panel'}
                >
                  {isExpanded ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isExpanded ? 'Minimize' : 'Maximize'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    closePanel();
                    onClose?.();
                  }}
                  aria-label="Close panel"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close panel</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {artifacts.length > 0 ? (
          <Tabs
            value={activeArtifactId ?? artifacts[0]?.id}
            onValueChange={setActiveArtifact}
            className="flex-1 flex flex-col min-h-0"
          >
            {/* Artifact selector tabs */}
            <TabsList className="w-full justify-start rounded-none border-b border-zinc-200 dark:border-zinc-800 bg-transparent px-2 h-10 shrink-0">
              <div className="flex gap-1 overflow-x-auto scrollbar-thin">
                {artifacts.map((artifact) => (
                  <TabsTrigger
                    key={artifact.id}
                    value={artifact.id}
                    className="data-[state=active]:bg-zinc-100 dark:data-[state=active]:bg-zinc-800 rounded-md px-3 py-1.5 text-xs flex items-center gap-1.5 max-w-[150px] shrink-0"
                  >
                    <ArtifactTypeIcon type={artifact.artifact_type} />
                    <span className="truncate">{artifact.title}</span>
                    {artifact.pinned && <Pin className="h-2.5 w-2.5 text-blue-500" />}
                  </TabsTrigger>
                ))}
              </div>
            </TabsList>

            {/* Per-artifact content */}
            {artifacts.map((artifact) => (
              <TabsContent
                key={artifact.id}
                value={artifact.id}
                className="flex-1 flex flex-col min-h-0 mt-0"
              >
                {renderedArtifact && renderedArtifact.id === artifact.id ? (
                  <>
                    {/* Viewer toolbar */}
                    <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 shrink-0">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="inline-flex shrink-0 rounded-lg border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-950">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant={
                                  innerTab === 'preview' && !isEditing ? 'secondary' : 'ghost'
                                }
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleInnerTabChange('preview')}
                                aria-label="Preview artifact"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Preview</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant={innerTab === 'code' || isEditing ? 'secondary' : 'ghost'}
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleInnerTabChange('code')}
                                aria-label="View source"
                              >
                                <Code2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Source</TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {renderedArtifact.title}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                            <span className="uppercase">{renderedArtifact.artifact_type}</span>
                            <span aria-hidden="true">·</span>
                            <span>v{renderedArtifact.version_info.current}</span>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn('text-xs', getStatusColor(renderedArtifact.status))}
                        >
                          {renderedArtifact.status}
                        </Badge>
                        <span className="hidden text-xs text-zinc-500 sm:flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(renderedArtifact.version_info.updated_at), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                if (!isEditing) {
                                  getArtifact(artifact.id)
                                    .then(setEditingArtifact)
                                    .catch((err: unknown) => {
                                      console.error('Failed to load artifact for editing:', err);
                                      toast.error('Failed to load artifact');
                                    });
                                } else {
                                  setEditingArtifact(null);
                                }
                                setIsEditing((v) => !v);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{isEditing ? 'Cancel edit' : 'Edit'}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={handleCopy}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={handleDownload}
                              aria-label="Download artifact"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Download</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => void handleOpenInSystemApp()}
                              aria-label="Open in system app"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Open in system app</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant={innerTab === 'versions' ? 'secondary' : 'ghost'}
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleInnerTabChange('versions')}
                              aria-label="Version history"
                            >
                              <History className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Versions</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => void handleRefreshRenderedArtifact()}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Refresh</TooltipContent>
                        </Tooltip>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={handleShare}>
                              <Share2 className="h-4 w-4 mr-2" />
                              Share
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void handlePublish()}>
                              <Globe className="h-4 w-4 mr-2" />
                              Publish
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handlePin}>
                              {activeArtifact?.pinned ? (
                                <>
                                  <PinOff className="h-4 w-4 mr-2" />
                                  Unpin
                                </>
                              ) : (
                                <>
                                  <Pin className="h-4 w-4 mr-2" />
                                  Pin
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleArchive}>
                              <Archive className="h-4 w-4 mr-2" />
                              Archive
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleDelete} className="text-red-500">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Inner tabs: Preview / Code / Versions */}
                    <Tabs
                      value={isEditing ? 'code' : innerTab}
                      onValueChange={(v) => {
                        handleInnerTabChange(v as InnerTab);
                      }}
                      className="flex-1 flex flex-col min-h-0"
                    >
                      {/* Preview tab */}
                      <TabsContent value="preview" className="flex-1 min-h-0 mt-0">
                        {isEditing ? (
                          <InlineArtifactEditor
                            artifact={
                              editingArtifact ?? {
                                id: artifact.id,
                                title: artifact.title,
                                artifact_type: artifact.artifact_type,
                                content: '',
                                metadata: { Generic: {} },
                                status: 'complete',
                                versions: [],
                                current_version: 1,
                                created_at: new Date().toISOString(),
                                updated_at: new Date().toISOString(),
                                tags: [],
                                pinned: false,
                              }
                            }
                            onSave={handleEditSave}
                            onCancel={() => {
                              setIsEditing(false);
                              setEditingArtifact(null);
                            }}
                          />
                        ) : (
                          <ScrollArea className="h-full">
                            <ArtifactRendererView
                              rendered={renderedArtifact}
                              isStreaming={isStreaming === artifact.id}
                              onFixBug={handleFixBug}
                            />
                          </ScrollArea>
                        )}
                      </TabsContent>

                      {/* Code tab */}
                      <TabsContent value="code" className="flex-1 min-h-0 mt-0 overflow-hidden">
                        <ScrollArea className="h-full">
                          <RawCodeView
                            content={getRawSource(renderedArtifact)}
                            language={getRawLanguage(renderedArtifact)}
                          />
                        </ScrollArea>
                      </TabsContent>

                      {/* Versions tab */}
                      <TabsContent value="versions" className="flex-1 min-h-0 mt-0">
                        <ScrollArea className="h-full">
                          <VersionsList
                            versions={versions}
                            currentVersion={renderedArtifact.version_info.current}
                            isLoading={isLoadingVersions}
                            onRollback={handleRollback}
                            onViewFullHistory={() => setShowVersionHistoryDialog(true)}
                          />
                        </ScrollArea>
                      </TabsContent>
                    </Tabs>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center p-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8 text-center">
            <div className="max-w-[240px]">
              <Code2 className="h-12 w-12 mx-auto mb-4 text-zinc-300 dark:text-zinc-700" />
              <h3 className="font-medium text-zinc-900 dark:text-zinc-100 mb-1">
                No artifacts yet
              </h3>
              <p className="text-sm text-zinc-500">
                Artifacts will appear here when AGI Workforce generates code, documents, or other
                content.
              </p>
            </div>
          </div>
        )}
      </div>

      <Dialog open={showVersionHistoryDialog} onOpenChange={setShowVersionHistoryDialog}>
        <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">Version History</DialogTitle>
          <DialogDescription className="sr-only">
            Compare and restore previous versions of this artifact.
          </DialogDescription>
          {activeArtifactId && (
            <ArtifactVersionHistory
              artifactId={activeArtifactId}
              currentVersion={renderedArtifact?.version_info.current ?? 1}
              className="max-h-[70vh]"
              onRollbackSuccess={() => {
                setShowVersionHistoryDialog(false);
                getRenderedArtifact(activeArtifactId)
                  .then(setRenderedArtifact)
                  .catch((err: unknown) => {
                    console.error('Failed to refresh artifact after rollback:', err);
                  });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {shareDialogArtifactId && (
        <ShareArtifactDialog
          artifact={
            useArtifactStore.getState().artifacts.get(shareDialogArtifactId) ?? {
              id: shareDialogArtifactId,
              title: artifacts.find((a) => a.id === shareDialogArtifactId)?.title ?? 'Artifact',
              artifact_type:
                artifacts.find((a) => a.id === shareDialogArtifactId)?.artifact_type ?? 'code',
              content: '',
              metadata: { Generic: {} },
              status: 'complete',
              versions: [],
              current_version: 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              tags: [],
              pinned: false,
            }
          }
          isOpen={!!shareDialogArtifactId}
          onClose={() => setShareDialogArtifactId(null)}
        />
      )}
    </>
  );
}

function RawCodeView({ content, language }: { content: string; language: string }) {
  return (
    <SyntaxHighlighter
      language={language}
      style={oneDark}
      customStyle={{
        margin: 0,
        padding: '1rem',
        background: 'transparent',
        fontSize: '12px',
        lineHeight: '1.6',
        minHeight: '100%',
      }}
      showLineNumbers
      lineNumberStyle={{
        minWidth: '2.5em',
        paddingRight: '1em',
        color: '#4b5563',
        userSelect: 'none',
      }}
      wrapLongLines={false}
    >
      {content}
    </SyntaxHighlighter>
  );
}

interface VersionsListProps {
  versions: ArtifactVersion[];
  currentVersion: number;
  isLoading: boolean;
  onRollback: (version: number) => void;
  onViewFullHistory: () => void;
}

function VersionsList({
  versions,
  currentVersion,
  isLoading,
  onRollback,
  onViewFullHistory,
}: VersionsListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-center">
        <p className="text-sm text-zinc-500">No version history available.</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      {versions.map((v) => (
        <div
          key={v.version}
          className={cn(
            'rounded-lg border p-3 text-sm transition-colors',
            v.version === currentVersion
              ? 'border-blue-500/50 bg-blue-500/5'
              : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700',
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">v{v.version}</span>
              {v.version === currentVersion && (
                <Badge variant="secondary" className="text-xs">
                  Current
                </Badge>
              )}
            </div>
            {v.version !== currentVersion && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => onRollback(v.version)}
              >
                Restore
              </Button>
            )}
          </div>
          <div className="text-xs text-zinc-500 flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
            </span>
            <span>{(v.size_bytes / 1024).toFixed(1)} KB</span>
          </div>
          {v.change_description && (
            <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400 italic">
              {v.change_description}
            </p>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={onViewFullHistory}
        className="w-full text-xs text-blue-500 hover:text-blue-400 py-2 transition-colors"
      >
        View full diff history
      </button>
    </div>
  );
}

function getRawSource(rendered: RenderedArtifact): string {
  const c = rendered.rendered_content;
  if (c.type === 'Code') return c.data.source;
  if (c.type === 'Document') return c.data.source;
  if (c.type === 'Diagram') return c.data.source;
  if (c.type === 'Web') return c.data.html;
  return JSON.stringify(c, null, 2);
}

function getRawLanguage(rendered: RenderedArtifact): string {
  const c = rendered.rendered_content;
  if (c.type === 'Code') return c.data.language;
  if (c.type === 'Document') return c.data.format === 'markdown' ? 'markdown' : 'text';
  if (c.type === 'Diagram') return 'mermaid';
  if (c.type === 'Web') return 'html';
  return 'json';
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'streaming':
      return 'border-blue-500 text-blue-500 bg-blue-500/10';
    case 'complete':
      return 'border-green-500 text-green-500 bg-green-500/10';
    case 'failed':
      return 'border-red-500 text-red-500 bg-red-500/10';
    case 'archived':
      return 'border-zinc-500 text-zinc-500 bg-zinc-500/10';
    default:
      return '';
  }
}
