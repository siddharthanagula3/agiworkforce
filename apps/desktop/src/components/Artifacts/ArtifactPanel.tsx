/**
 * ArtifactPanel Component
 *
 * Side panel for displaying and managing artifacts alongside the chat.
 * Supports tabs for multiple artifacts, version history, and real-time updates.
 */

import { formatDistanceToNow } from 'date-fns';
import {
  Archive,
  ChevronDown,
  Clock,
  Code2,
  Copy,
  Download,
  GitBranch,
  History,
  Maximize2,
  Minimize2,
  Pencil,
  Pin,
  PinOff,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Separator } from '@/components/ui/Separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import {
  useArtifactStore,
  type Artifact,
  type ArtifactDiff,
  type ArtifactSummary,
  type ArtifactVersion,
  type RenderedArtifact,
} from '@/stores/artifactStore';
import { ArtifactTypeIcon, getArtifactFileExtension } from '@/lib/artifactUtils';
import { ArtifactRendererView } from './ArtifactRendererView';
import { InlineArtifactEditor } from './InlineArtifactEditor';
import { ShareArtifactDialog } from './ShareArtifactDialog';
import { VersionHistoryDialog } from './VersionHistoryDialog';

interface ArtifactPanelProps {
  conversationId?: number;
  className?: string;
  onClose?: () => void;
}

export function ArtifactPanel({ conversationId, className, onClose }: ArtifactPanelProps) {
  const {
    activeArtifactId,
    panelOpen,
    panelWidth,
    isStreaming,
    setActiveArtifact,
    closePanel,
    setPanelWidth,
    getArtifact,
    getRenderedArtifact,
    deleteArtifact,
    archiveArtifact,
    pinArtifact,
    rollbackArtifact,
    getArtifactsByConversation,
    applyDiffToArtifact,
  } = useArtifactStore();

  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([]);
  const [renderedArtifact, setRenderedArtifact] = useState<RenderedArtifact | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versions, setVersions] = useState<ArtifactVersion[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingArtifact, setEditingArtifact] = useState<Artifact | null>(null);
  const [shareDialogArtifactId, setShareDialogArtifactId] = useState<string | null>(null);
  const resizeHandlersRef = useRef<{ move?: (e: MouseEvent) => void; up?: () => void }>({});

  // Load artifacts for conversation
  useEffect(() => {
    if (conversationId) {
      getArtifactsByConversation(conversationId).then(setArtifacts);
    }
  }, [conversationId, getArtifactsByConversation]);

  // Load rendered artifact when active artifact changes
  useEffect(() => {
    if (activeArtifactId) {
      getRenderedArtifact(activeArtifactId).then(setRenderedArtifact);
    } else {
      setRenderedArtifact(null);
    }
  }, [activeArtifactId, getRenderedArtifact, isStreaming]);

  // Auto-update during streaming — guard against stale IPC responses arriving
  // after the interval is cleared (e.g. slow round-trip after streaming ends).
  useEffect(() => {
    if (isStreaming && activeArtifactId === isStreaming) {
      let cancelled = false;
      const interval = setInterval(() => {
        getRenderedArtifact(activeArtifactId).then((r) => {
          if (!cancelled) setRenderedArtifact(r);
        });
      }, 100);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }
    return undefined;
  }, [isStreaming, activeArtifactId, getRenderedArtifact]);

  // Load version history
  const loadVersionHistory = useCallback(async () => {
    if (!activeArtifactId) return;
    try {
      const history = await useArtifactStore.getState().getVersionHistory(activeArtifactId);
      if (history) {
        setVersions(history);
        setShowVersionHistory(true);
      }
    } catch {
      toast.error('Failed to load version history');
    }
  }, [activeArtifactId]);

  // Handle resize
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);

      const startX = e.clientX;
      const startWidth = panelWidth;

      const handleMouseMove = (e: MouseEvent) => {
        const delta = startX - e.clientX;
        const newWidth = Math.max(320, Math.min(800, startWidth + delta));
        setPanelWidth(newWidth);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', resizeHandlersRef.current.move!);
        document.removeEventListener('mouseup', resizeHandlersRef.current.up!);
        resizeHandlersRef.current = {};
      };

      resizeHandlersRef.current = { move: handleMouseMove, up: handleMouseUp };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [panelWidth, setPanelWidth],
  );

  // Cleanup effect to ensure resize listeners are removed on unmount
  useEffect(() => {
    return () => {
      if (resizeHandlersRef.current.move) {
        document.removeEventListener('mousemove', resizeHandlersRef.current.move);
      }
      if (resizeHandlersRef.current.up) {
        document.removeEventListener('mouseup', resizeHandlersRef.current.up);
      }
    };
  }, []);

  // Handle copy
  const handleCopy = useCallback(async () => {
    if (!renderedArtifact) return;
    const artifact = await getArtifact(renderedArtifact.id);
    if (artifact) {
      await navigator.clipboard.writeText(artifact.content);
      toast.success('Copied to clipboard');
    }
  }, [renderedArtifact, getArtifact]);

  // Handle download
  const handleDownload = useCallback(async () => {
    if (!renderedArtifact) return;
    const artifact = await getArtifact(renderedArtifact.id);
    if (!artifact) return;

    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title}.${getArtifactFileExtension(artifact.artifact_type)}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('Downloaded artifact');
  }, [renderedArtifact, getArtifact]);

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!renderedArtifact) return;
    const success = await deleteArtifact(renderedArtifact.id);
    if (success) {
      toast.success('Artifact deleted');
      setArtifacts((prev) => prev.filter((a) => a.id !== renderedArtifact.id));
    }
  }, [renderedArtifact, deleteArtifact]);

  // Handle archive
  const handleArchive = useCallback(async () => {
    if (!renderedArtifact) return;
    const success = await archiveArtifact(renderedArtifact.id);
    if (success) {
      toast.success('Artifact archived');
    }
  }, [renderedArtifact, archiveArtifact]);

  // Handle pin
  const handlePin = useCallback(async () => {
    if (!renderedArtifact) return;
    const artifact = await getArtifact(renderedArtifact.id);
    if (!artifact) return;
    const success = await pinArtifact(renderedArtifact.id, !artifact.pinned);
    if (success) {
      toast.success(artifact.pinned ? 'Unpinned artifact' : 'Pinned artifact');
    }
  }, [renderedArtifact, getArtifact, pinArtifact]);

  // Handle rollback
  const handleRollback = useCallback(
    async (version: number) => {
      if (!activeArtifactId) return;
      const artifact = await rollbackArtifact(activeArtifactId, version);
      if (artifact) {
        toast.success(`Rolled back to version ${version}`);
        setShowVersionHistory(false);
        getRenderedArtifact(activeArtifactId).then(setRenderedArtifact);
      }
    },
    [activeArtifactId, rollbackArtifact, getRenderedArtifact],
  );

  // Handle inline edit save
  const handleEditSave = useCallback(
    async (diff: ArtifactDiff) => {
      if (!activeArtifactId) return;
      const artifact = await applyDiffToArtifact(activeArtifactId, diff);
      if (artifact) {
        toast.success('Artifact updated');
        setIsEditing(false);
        getRenderedArtifact(activeArtifactId).then(setRenderedArtifact);
      } else {
        toast.error('Failed to save changes');
      }
    },
    [activeArtifactId, applyDiffToArtifact, getRenderedArtifact],
  );

  // Handle share dialog open
  const handleShare = useCallback(() => {
    if (!activeArtifactId) return;
    setShareDialogArtifactId(activeArtifactId);
  }, [activeArtifactId]);

  if (!panelOpen) return null;

  const activeArtifact = artifacts.find((a) => a.id === activeArtifactId);

  return (
    <>
      {/* Resize handle */}
      <div
        className={cn(
          'w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors z-20',
          isResizing && 'bg-blue-500',
        )}
        onMouseDown={handleResizeStart}
      />

      {/* Panel content */}
      <div
        className={cn(
          'flex flex-col bg-zinc-50 dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800',
          isExpanded && 'fixed inset-0 z-50 border-none',
          className,
        )}
        style={{ width: isExpanded ? '100%' : panelWidth }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setIsExpanded(!isExpanded)}
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
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close panel</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Tabs for multiple artifacts */}
        {artifacts.length > 0 ? (
          <Tabs
            value={activeArtifactId || artifacts[0]?.id}
            onValueChange={setActiveArtifact}
            className="flex-1 flex flex-col min-h-0"
          >
            <TabsList className="w-full justify-start rounded-none border-b border-zinc-200 dark:border-zinc-800 bg-transparent px-2 h-10">
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

            {/* Artifact content */}
            {artifacts.map((artifact) => (
              <TabsContent
                key={artifact.id}
                value={artifact.id}
                className="flex-1 flex flex-col min-h-0 mt-0"
              >
                {renderedArtifact && renderedArtifact.id === artifact.id && (
                  <>
                    {/* Toolbar */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn('text-xs', getStatusColor(renderedArtifact.status))}
                        >
                          {renderedArtifact.status}
                        </Badge>
                        <Separator orientation="vertical" className="h-4" />
                        <span className="text-xs text-zinc-500 flex items-center gap-1">
                          <GitBranch className="h-3 w-3" />v{renderedArtifact.version_info.current}
                        </span>
                        <span className="text-xs text-zinc-500 flex items-center gap-1">
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
                              onClick={loadVersionHistory}
                            >
                              <History className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Version history</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                if (!isEditing) {
                                  // Load full artifact into state before opening editor
                                  // so we don't call getState() during render.
                                  getArtifact(artifact.id).then(setEditingArtifact);
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
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Download</TooltipContent>
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

                    {/* Rendered content or inline editor */}
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
                      <ScrollArea className="flex-1">
                        <ArtifactRendererView
                          rendered={renderedArtifact}
                          isStreaming={isStreaming === artifact.id}
                        />
                      </ScrollArea>
                    )}
                  </>
                )}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          // Empty state
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

      {/* Version history dialog */}
      <VersionHistoryDialog
        open={showVersionHistory}
        onOpenChange={setShowVersionHistory}
        versions={versions}
        currentVersion={renderedArtifact?.version_info.current || 1}
        onRollback={handleRollback}
      />

      {/* Share dialog */}
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

// Helper functions

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
