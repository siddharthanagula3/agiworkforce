'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Code2, X, FileCode, PanelRightOpen, FolderDown } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { Button } from '@agiworkforce/ui';
import { useChatUIStore } from '@agiworkforce/unified-chat';
import type { SharedArtifact } from '@agiworkforce/types';
import {
  publishArtifact as publishArtifactService,
  type PublishResult,
} from '@agiworkforce/artifacts';
import { useArtifactsStore, type Artifact } from '../../stores/artifacts-store';
import { useStreamingArtifactStore } from '../../stores/streaming-artifact-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { ArtifactPreview } from './ArtifactPreview';
import { StreamingArtifactView } from './StreamingArtifactView';
import { downloadAllArtifacts } from '../../utils/downloadArtifacts';
import { createWebCloudPublisher } from './publishArtifactClient';
import { toast } from 'sonner';

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

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
        <Code2 className="h-6 w-6 text-muted-foreground/60" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">No artifacts yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Renderable code and generated files will appear here
        </p>
      </div>
    </div>
  );
}

function ArtifactViewer({
  artifact,
  versionHistory,
  onClose,
  publishArtifact,
}: {
  artifact: Artifact;
  versionHistory: SharedArtifact[];
  onClose: () => void;
  publishArtifact?: () => Promise<PublishResult>;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ArtifactPreview
        artifact={artifact}
        versionHistory={versionHistory}
        className="mt-0 rounded-none border-0"
        variant="panel"
        onClose={onClose}
        {...(publishArtifact ? { publishArtifact } : {})}
      />
    </div>
  );
}

const MOBILE_OVERLAY_QUERY = '(max-width: 639px)';

const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 900;
const PANEL_WIDTH_KEY_STEP = 24;

function useOverlayLayout(): 'unknown' | 'mobile' | 'desktop' {
  const [layout, setLayout] = useState<'unknown' | 'mobile' | 'desktop'>('unknown');

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setLayout('desktop');
      return;
    }
    const query = window.matchMedia(MOBILE_OVERLAY_QUERY);
    const apply = () => setLayout(query.matches ? 'mobile' : 'desktop');
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  return layout;
}

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.offsetParent !== null || element === document.activeElement);
}

function readArtifactDeepLink(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get('artifact');
  } catch {
    return null;
  }
}

export function ArtifactsPanel() {
  const {
    getConversationArtifacts,
    getArtifactVersions,
    selectedArtifactId,
    panelOpen,
    cloudSyncStatus,
    cloudSyncError,
    persistenceDegraded,
    selectArtifact,
    setPanelOpen,
  } = useArtifactsStore();
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const streaming = useStreamingArtifactStore((s) => s.streaming);
  // re-exported through `useArtifact`) with no caller for the setter and a
  const panelWidth = useChatUIStore((s) => s.artifactPanelWidth);
  const setPanelWidth = useChatUIStore((s) => s.setArtifactPanelWidth);
  const layout = useOverlayLayout();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const cloudPublisher = useMemo(
    () => createWebCloudPublisher({ conversationId: activeConversationId ?? null }),
    [activeConversationId],
  );
  const makePublishHandler = useCallback(
    (artifact: Artifact) => () =>
      publishArtifactService({
        artifact: {
          id: artifact.id,
          title: artifact.title,
          content: artifact.content,
          type: artifact.type,
          ...(artifact.language ? { language: artifact.language } : {}),
        },
        privacyMode: 'managed',
        surface: 'web',
        cloudPublisher,
      }),
    [cloudPublisher],
  );

  const artifacts = activeConversationId ? getConversationArtifacts(activeConversationId) : [];

  const selectedArtifact = artifacts.find((a) => a.id === selectedArtifactId) ?? artifacts[0];

  const streamingArtifact =
    streaming &&
    streaming.conversationId === activeConversationId &&
    !artifacts.some((a) => a.id === streaming.artifactId)
      ? streaming
      : null;
  const showStreamingView = Boolean(
    streamingArtifact && (selectedArtifactId === streamingArtifact.artifactId || !selectedArtifact),
  );

  const previousConversationRef = useRef<string | null>(activeConversationId);
  useEffect(() => {
    const previous = previousConversationRef.current;
    previousConversationRef.current = activeConversationId;
    if (!previous || !activeConversationId || previous === activeConversationId) return;

    const store = useArtifactsStore.getState();
    const conversationArtifacts = store.getConversationArtifacts(activeConversationId);
    const selected = store.selectedArtifactId;
    if (selected && conversationArtifacts.some((artifact) => artifact.id === selected)) return;
    store.selectArtifact(conversationArtifacts[0]?.id ?? null);
  }, [activeConversationId]);

  const [deepLinkId, setDeepLinkId] = useState<string | null>(() => readArtifactDeepLink());
  const appliedDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    const onPopState = () => setDeepLinkId(readArtifactDeepLink());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const artifactCount = artifacts.length;
  useEffect(() => {
    if (!deepLinkId || appliedDeepLinkRef.current === deepLinkId) return;
    void artifactCount;
    const store = useArtifactsStore.getState();
    if (!store.artifacts.some((artifact) => artifact.id === deepLinkId)) return;
    appliedDeepLinkRef.current = deepLinkId;
    store.selectArtifact(deepLinkId);
    store.setPanelOpen(true);
  }, [deepLinkId, artifactCount]);

  const isModalOverlay = layout === 'mobile' && panelOpen;

  useEffect(() => {
    if (!isModalOverlay) return;
    const panel = panelRef.current;
    if (!panel) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initial = focusableWithin(panel)[0] ?? panel;
    initial.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setPanelOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = focusableWithin(panel);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener('keydown', onKeyDown);
    return () => {
      panel.removeEventListener('keydown', onKeyDown);
      const restore = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (restore && document.contains(restore)) restore.focus();
    };
  }, [isModalOverlay, setPanelOpen]);

  const onResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (layout !== 'desktop') return;
      event.preventDefault();
      const onPointerMove = (move: PointerEvent) => {
        setPanelWidth(window.innerWidth - move.clientX);
      };
      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        document.body.style.removeProperty('user-select');
      };
      document.body.style.setProperty('user-select', 'none');
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    },
    [layout, setPanelWidth],
  );

  const onResizeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      setPanelWidth(
        panelWidth + (event.key === 'ArrowLeft' ? PANEL_WIDTH_KEY_STEP : -PANEL_WIDTH_KEY_STEP),
      );
    },
    [panelWidth, setPanelWidth],
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
        ref={panelRef}
        role={isModalOverlay ? 'dialog' : undefined}
        aria-modal={isModalOverlay ? true : undefined}
        aria-label={isModalOverlay ? 'Artifacts' : undefined}
        tabIndex={isModalOverlay ? -1 : undefined}
        style={layout === 'desktop' ? { width: panelWidth } : undefined}
        className={cn(
          'flex flex-col border-l border-border/30 outline-none',
          'bg-card/95 backdrop-blur-xl',
          'fixed inset-y-0 right-0 z-40 w-full',
          'sm:relative sm:inset-auto sm:z-auto sm:w-full md:w-1/2 lg:w-[480px] sm:min-w-[280px] sm:shrink',
          'animate-in slide-in-from-right duration-300',
        )}
      >
        {/* AUDIT-FIX ART-23: drag handle (desktop only). Also keyboard
            operable — a mouse-only resize is not a resize for everyone. */}
        {layout === 'desktop' && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize artifacts panel"
            aria-valuenow={panelWidth}
            aria-valuemin={MIN_PANEL_WIDTH}
            aria-valuemax={MAX_PANEL_WIDTH}
            tabIndex={0}
            onPointerDown={onResizePointerDown}
            onKeyDown={onResizeKeyDown}
            className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize bg-transparent transition-colors hover:bg-primary/30 focus-visible:bg-primary/40 focus-visible:outline-none"
          />
        )}
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
            {/* AUDIT-FIX ART-20: quota-exhausted persistence is stated, not
                hidden. Without this the artifacts simply vanish on reload. */}
            {persistenceDegraded && (
              <span
                className="text-[10px] text-destructive"
                title="Browser storage is full, so artifacts are not being saved. They will disappear when this tab is closed."
              >
                Not saved
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
                  publishArtifact={makePublishHandler(selectedArtifact)}
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

export function ArtifactsToggleButton() {
  const { getConversationArtifacts, panelOpen, togglePanel } = useArtifactsStore();
  const activeConversationId = useChatStore((s) => s.activeConversationId);

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
