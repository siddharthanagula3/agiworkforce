/**
 * ArtifactPanel Component
 *
 * Side panel for displaying and managing artifacts alongside the chat.
 * Features artifact tabs, per-artifact Preview/Code/Versions inner tabs,
 * version history, and real-time streaming updates.
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
import { useCallback, useEffect, useState } from 'react';
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
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ArtifactPanelProps {
  conversationId?: number;
  className?: string;
  onClose?: () => void;
}

type InnerTab = 'preview' | 'code' | 'versions';

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
  } = useArtifactStore();

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

  // Auto-update during streaming
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

  // Load versions when switching to versions tab
  useEffect(() => {
    if (innerTab === 'versions' && activeArtifactId) {
      setIsLoadingVersions(true);
      getVersionHistory(activeArtifactId)
        .then((v) => setVersions(v ?? []))
        .finally(() => setIsLoadingVersions(false));
    }
  }, [innerTab, activeArtifactId, getVersionHistory]);

  // Reset inner tab when switching artifacts
  useEffect(() => {
    setInnerTab('preview');
    setIsEditing(false);
    setEditingArtifact(null);
  }, [activeArtifactId]);

  const handleCopy = useCallback(async () => {
    if (!renderedArtifact) return;
    const artifact = await getArtifact(renderedArtifact.id);
    if (artifact) {
      await navigator.clipboard.writeText(artifact.content);
      toast.success('Copied to clipboard');
    }
  }, [renderedArtifact, getArtifact]);

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

  const handleDelete = useCallback(async () => {
    if (!renderedArtifact) return;
    const success = await deleteArtifact(renderedArtifact.id);
    if (success) {
      toast.success('Artifact deleted');
      setArtifacts((prev) => prev.filter((a) => a.id !== renderedArtifact.id));
    }
  }, [renderedArtifact, deleteArtifact]);

  const handleArchive = useCallback(async () => {
    if (!renderedArtifact) return;
    const success = await archiveArtifact(renderedArtifact.id);
    if (success) toast.success('Artifact archived');
  }, [renderedArtifact, archiveArtifact]);

  const handlePin = useCallback(async () => {
    if (!renderedArtifact) return;
    const artifact = await getArtifact(renderedArtifact.id);
    if (!artifact) return;
    const success = await pinArtifact(renderedArtifact.id, !artifact.pinned);
    if (success) toast.success(artifact.pinned ? 'Unpinned artifact' : 'Pinned artifact');
  }, [renderedArtifact, getArtifact, pinArtifact]);

  const handleRollback = useCallback(
    async (version: number) => {
      if (!activeArtifactId) return;
      const artifact = await rollbackArtifact(activeArtifactId, version);
      if (artifact) {
        toast.success(`Rolled back to version ${version}`);
        setShowVersionHistoryDialog(false);
        getRenderedArtifact(activeArtifactId).then(setRenderedArtifact);
      }
    },
    [activeArtifactId, rollbackArtifact, getRenderedArtifact],
  );

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

  const handleShare = useCallback(() => {
    if (!activeArtifactId) return;
    setShareDialogArtifactId(activeArtifactId);
  }, [activeArtifactId]);

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
                    {/* Status bar */}
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 shrink-0">
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
                              onClick={() => {
                                if (!isEditing) {
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

                    {/* Inner tabs: Preview / Code / Versions */}
                    <Tabs
                      value={isEditing ? 'code' : innerTab}
                      onValueChange={(v) => {
                        if (isEditing) {
                          setIsEditing(false);
                          setEditingArtifact(null);
                        }
                        setInnerTab(v as InnerTab);
                      }}
                      className="flex-1 flex flex-col min-h-0"
                    >
                      <TabsList className="rounded-none border-b border-zinc-200 dark:border-zinc-800 bg-transparent h-9 px-3 shrink-0 justify-start gap-0">
                        <TabsTrigger
                          value="preview"
                          className="text-xs px-3 h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent"
                        >
                          Preview
                        </TabsTrigger>
                        <TabsTrigger
                          value="code"
                          className="text-xs px-3 h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent"
                        >
                          Code
                        </TabsTrigger>
                        <TabsTrigger
                          value="versions"
                          className="text-xs px-3 h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent flex items-center gap-1"
                        >
                          <History className="h-3 w-3" />
                          Versions
                          {renderedArtifact.version_info.total > 1 && (
                            <Badge variant="secondary" className="text-xs px-1 py-0 h-4 ml-0.5">
                              {renderedArtifact.version_info.total}
                            </Badge>
                          )}
                        </TabsTrigger>
                      </TabsList>

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

      <VersionHistoryDialog
        open={showVersionHistoryDialog}
        onOpenChange={setShowVersionHistoryDialog}
        versions={versions}
        currentVersion={renderedArtifact?.version_info.current ?? 1}
        onRollback={handleRollback}
      />

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

// =============================================================================
// Raw Code View
// =============================================================================

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

// =============================================================================
// Versions List
// =============================================================================

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

// =============================================================================
// Helpers
// =============================================================================

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
