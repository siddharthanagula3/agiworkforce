'use client';

import { Code2, X, FileCode, PanelRightOpen, FolderDown } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { Button } from '@agiworkforce/ui';
import type { SharedArtifact } from '@agiworkforce/types';
import { useArtifactsStore, type Artifact } from '../../stores/artifacts-store';
import { useStreamingArtifactStore } from '../../stores/streaming-artifact-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { ArtifactPreview } from './ArtifactPreview';
import { StreamingArtifactView } from './StreamingArtifactView';
import { downloadAllArtifacts } from '../../utils/downloadArtifacts';
import { toast } from 'sonner';

// ============================================================================
// Artifact Tab
// ============================================================================

function ArtifactTab({
  artifact,
  isSelected,
  onSelect,
}: {
  artifact: Artifact;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
        isSelected
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
      title={artifact.title}
    >
      <FileCode className="h-3 w-3 shrink-0" />
      <span className="max-w-[120px] truncate">{artifact.title}</span>
    </button>
  );
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
        <Code2 className="h-6 w-6 text-muted-foreground/60" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">No artifacts yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Code blocks from AI responses will appear here
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Artifact Content Viewer · delegates to ArtifactPreview for full
// Preview/Code tabs, versioning, sharing, and download functionality.
// ============================================================================

function ArtifactViewer({
  artifact,
  versionHistory,
  onClose,
}: {
  artifact: Artifact;
  versionHistory: SharedArtifact[];
  onClose: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ArtifactPreview
        artifact={artifact}
        versionHistory={versionHistory}
        className="mt-0 rounded-none border-0"
        variant="panel"
        onClose={onClose}
      />
    </div>
  );
}

// ============================================================================
// Main Panel
// ============================================================================

export function ArtifactsPanel() {
  const {
    getConversationArtifacts,
    getArtifactVersions,
    selectedArtifactId,
    panelOpen,
    cloudSyncStatus,
    cloudSyncError,
    selectArtifact,
    setPanelOpen,
  } = useArtifactsStore();
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const streaming = useStreamingArtifactStore((s) => s.streaming);

  // Only show artifacts that belong to the current conversation.
  // When there is no active conversation (new/empty chat), the list is empty.
  const artifacts = activeConversationId ? getConversationArtifacts(activeConversationId) : [];

  // `selectedArtifactId` is global UI state and may still point at an artifact
  // from the conversation the user just left. Always give the active
  // conversation an immediately useful viewer by falling back to its first
  // artifact; otherwise the rail can list files while the content pane lies
  // with the unrelated "No artifacts yet" state.
  const selectedArtifact = artifacts.find((a) => a.id === selectedArtifactId) ?? artifacts[0];

  // Live-streaming artifact (Claude-style streamed file write): shown while a
  // renderable fence is still open in the streaming message. Hidden as soon as
  // a persisted artifact with the SAME deterministic id lands (fence closed) —
  // the panel then swaps to the full ArtifactPreview, Preview tab first.
  const streamingArtifact =
    streaming &&
    streaming.conversationId === activeConversationId &&
    !artifacts.some((a) => a.id === streaming.artifactId)
      ? streaming
      : null;
  const showStreamingView = Boolean(
    streamingArtifact && (selectedArtifactId === streamingArtifact.artifactId || !selectedArtifact),
  );

  if (!panelOpen) return null;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm sm:hidden"
        onClick={() => setPanelOpen(false)}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={cn(
          'flex flex-col border-l border-border/30',
          'bg-card/95 backdrop-blur-xl',
          // Mobile: full-screen overlay
          'fixed inset-y-0 right-0 z-40 w-full',
          // Desktop: inline panel · responsive width
          'sm:relative sm:inset-auto sm:z-auto sm:w-full md:w-1/2 lg:w-[480px] sm:shrink-0',
          // Slide-in animation
          'animate-in slide-in-from-right duration-300',
        )}
      >
        {/* Header — slim strip: panel title + count badge + Download all.
            Close X only shown here when no artifact is selected (no toolbar
            Close visible). When an artifact IS selected, the ArtifactPreview
            panel-variant toolbar carries the Close button. This ensures the
            panel is always closeable on mobile even with zero or unresolved
            artifact selections. */}
        <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <PanelRightOpen className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Artifacts</h2>
            {artifacts.length > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {artifacts.length}
              </span>
            )}
            {cloudSyncStatus !== 'idle' && (
              <span
                className={cn(
                  'text-[10px]',
                  cloudSyncStatus === 'error' ? 'text-destructive' : 'text-muted-foreground',
                )}
                title={cloudSyncStatus === 'error' ? (cloudSyncError ?? undefined) : undefined}
              >
                {cloudSyncStatus === 'syncing'
                  ? 'Syncing…'
                  : cloudSyncStatus === 'error'
                    ? 'Sync retrying'
                    : 'Synced'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {artifacts.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  toast.promise(downloadAllArtifacts(artifacts), {
                    loading: 'Preparing artifact download…',
                    success: 'Artifact download ready',
                    error: (error) =>
                      error instanceof Error ? error.message : 'Could not download artifacts',
                  });
                }}
                className="h-7 px-2 text-xs"
                title="Download all artifacts as zip"
              >
                <FolderDown className="h-3.5 w-3.5" />
                <span className="ml-1 hidden sm:inline">Download all</span>
              </Button>
            )}
            {/* Show Close here only when the viewer toolbar is not visible
                (empty panel or no artifact selected) to avoid duplicating it. */}
            {!selectedArtifact && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPanelOpen(false)}
                className="h-7 w-7 p-0"
                aria-label="Close artifacts panel"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {artifacts.length === 0 && !streamingArtifact ? (
          <EmptyState />
        ) : (
          <>
            {/* Tabs · horizontal scrollable list */}
            <div className="border-b border-border/20 px-3 py-2">
              <div className="flex gap-1 overflow-x-auto scrollbar-none">
                {artifacts.map((artifact) => (
                  <ArtifactTab
                    key={artifact.id}
                    artifact={artifact}
                    isSelected={artifact.id === selectedArtifact?.id}
                    onSelect={() => selectArtifact(artifact.id)}
                  />
                ))}
                {/* Live streaming artifact tab · pulsing dot marks the write in progress */}
                {streamingArtifact && (
                  <button
                    onClick={() => selectArtifact(streamingArtifact.artifactId)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                      showStreamingView
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                    title={streamingArtifact.title}
                  >
                    <span
                      className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary"
                      aria-hidden="true"
                    />
                    <span className="max-w-[120px] truncate">{streamingArtifact.title}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex flex-1 flex-col overflow-hidden bg-[#1e1e1e]">
              {showStreamingView && streamingArtifact ? (
                <StreamingArtifactView artifact={streamingArtifact} />
              ) : selectedArtifact ? (
                <ArtifactViewer
                  artifact={selectedArtifact}
                  versionHistory={getArtifactVersions(selectedArtifact.id)}
                  onClose={() => setPanelOpen(false)}
                />
              ) : (
                <EmptyState />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ============================================================================
// Artifact Toggle Button (for use in chat header)
// ============================================================================

export function ArtifactsToggleButton() {
  const { getConversationArtifacts, panelOpen, togglePanel } = useArtifactsStore();
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  // Badge count is scoped to the current conversation only.
  const artifacts = activeConversationId ? getConversationArtifacts(activeConversationId) : [];

  return (
    <button
      onClick={togglePanel}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
        panelOpen
          ? 'bg-primary/15 text-primary'
          : 'bg-card/60 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted/60 hover:text-foreground',
      )}
      aria-label={panelOpen ? 'Close artifacts panel' : 'Open artifacts panel'}
      title="Artifacts"
    >
      <Code2 className="h-4 w-4" />
      {/* Badge showing count */}
      {artifacts.length > 0 && !panelOpen && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          {artifacts.length}
        </span>
      )}
    </button>
  );
}
